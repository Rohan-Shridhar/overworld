import type { Server as HttpServer } from 'node:http';
import { logger } from '../lib/logger.js';
import { SHUTDOWN_TIMEOUT_MS } from './constants.js';
import { disconnectDatabase } from './database.js';
import { closeSocketServer } from './socket.js';

export interface ShutdownOptions {
  httpServer: HttpServer;
  signal: string;
  /** Injected so tests can observe the exit instead of ending the process. */
  exit?: (code: number) => void;
  timeoutMs?: number;
}

/**
 * Ordered graceful shutdown: stop accepting realtime traffic, stop accepting HTTP
 * traffic, then close the database connection. A timer forces the process down if
 * any step hangs, so a stuck socket can never block the exit forever.
 */
export async function shutdown({
  httpServer,
  signal,
  exit = (code: number) => process.exit(code),
  timeoutMs = SHUTDOWN_TIMEOUT_MS,
}: ShutdownOptions): Promise<void> {
  logger.info('Shutting down', { signal });

  const forceExit = setTimeout(() => {
    logger.error('Graceful shutdown timed out; forcing exit', { timeoutMs });
    exit(1);
  }, timeoutMs);

  forceExit.unref();

  try {
    await closeSocketServer();

    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
      httpServer.closeIdleConnections();
    });

    await disconnectDatabase();

    clearTimeout(forceExit);
    logger.info('Shutdown complete');
    exit(0);
  } catch (error) {
    clearTimeout(forceExit);
    logger.error('Error during shutdown', {
      error: error instanceof Error ? error : String(error),
    });
    exit(1);
  }
}
