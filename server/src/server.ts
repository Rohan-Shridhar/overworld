import { createServer, type Server as HttpServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { createApp } from './app.js';
import {
  API_PREFIX,
  APP_NAME,
  APP_VERSION,
  SERVER_HOST,
  SERVER_PORT,
  SOCKET_PATH,
  isServerlessRuntime,
  isTest,
} from './config/constants.js';
import { connectDatabase } from './config/database.js';
import { EnvValidationError, getEnv } from './config/env.js';
import { shutdown } from './config/shutdown.js';
import { createSocketServer } from './config/socket.js';
import { startSimulation } from './simulation/simulation.service.js';
import { logger } from './lib/logger.js';

const SIGNALS: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];

async function listen(httpServer: HttpServer): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      httpServer.off('listening', onListening);
      reject(error);
    };

    const onListening = () => {
      httpServer.off('error', onError);
      resolve();
    };

    httpServer.once('error', onError);
    httpServer.once('listening', onListening);
    httpServer.listen(SERVER_PORT, SERVER_HOST);
  });
}

export async function bootstrap(): Promise<void> {
  let mongoUri: string | undefined;

  try {
    mongoUri = getEnv().MONGODB_URI;
  } catch (error) {
    if (error instanceof EnvValidationError) {
      logger.error('Environment is incomplete; the API will run without a database', {
        reason: error.message,
      });
    } else {
      throw error;
    }
  }

  const httpServer = createServer(createApp());

  // Socket.IO needs a listener that outlives a single request. A serverless
  // function has none, so realtime is local-only and production uses HTTP
  // polling against the same endpoints.
  if (!isServerlessRuntime()) createSocketServer(httpServer);

  await listen(httpServer);

  logger.info(`${APP_NAME} API listening`, {
    version: APP_VERSION,
    url: `http://localhost:${SERVER_PORT}${API_PREFIX}`,
    socketPath: SOCKET_PATH,
  });

  SIGNALS.forEach((signal) => {
    process.once(signal, () => {
      void shutdown({ httpServer, signal });
    });
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', {
      error: reason instanceof Error ? reason : String(reason),
    });
  });

  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', { error });
    void shutdown({ httpServer, signal: 'uncaughtException' });
  });

  // Connect after the listener is up so /api/health can report progress immediately.
  void connectDatabase(mongoUri)
    .then(async (connected) => {
      if (!connected || isServerlessRuntime()) return;

      // Only a long-lived process may own the timer; serverless advances on request.
      const snapshot = await startSimulation();

      if (!snapshot) {
        logger.warn('Simulation engine did not start; the world clock is idle');
      }
    })
    .catch((error: unknown) => {
      logger.error('Database bootstrap failed', {
        error: error instanceof Error ? error : String(error),
      });
    });
}

const isDirectRun =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun && !isTest()) {
  bootstrap().catch((error: unknown) => {
    logger.error('Failed to start the API', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  });
}
