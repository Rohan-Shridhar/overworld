import mongoose from 'mongoose';
import { logger } from '../lib/logger.js';
import {
  DB_CONNECT_MAX_ATTEMPTS,
  DB_CONNECT_RETRY_DELAY_MS,
  DB_LOCAL_POOL_SIZE,
  DB_SERVERLESS_CONNECT_TIMEOUT_MS,
  DB_SERVERLESS_MAX_ATTEMPTS,
  DB_SERVERLESS_POOL_SIZE,
  DB_SERVERLESS_SELECTION_TIMEOUT_MS,
  DB_SERVER_SELECTION_TIMEOUT_MS,
  isProduction,
  isServerlessRuntime,
} from './constants.js';
import { EnvValidationError, getEnv } from './env.js';

export type DatabaseStatus = 'connected' | 'connecting' | 'disconnecting' | 'disconnected';

export interface DatabaseSnapshot {
  status: DatabaseStatus;
  readyState: number;
  name: string | null;
  host: string | null;
  lastError: string | null;
}

const READY_STATE: Record<number, DatabaseStatus> = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

let lastConnectionError: string | null = null;
let listenersRegistered = false;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function registerConnectionListeners(): void {
  if (listenersRegistered) return;
  listenersRegistered = true;

  mongoose.connection.on('connected', () => {
    lastConnectionError = null;
    logger.info('MongoDB connection established', {
      database: mongoose.connection.name,
      readyState: mongoose.connection.readyState,
    });
  });

  mongoose.connection.on('disconnected', () => {
    // Never log the URI: it carries credentials.
    logger.warn('MongoDB disconnected', {
      readyState: mongoose.connection.readyState,
      reason: lastConnectionError,
    });
  });

  mongoose.connection.on('error', (error: Error) => {
    lastConnectionError = sanitiseMongoMessage(error.message);
    logger.error('MongoDB connection error', {
      name: error.name,
      reason: lastConnectionError,
      readyState: mongoose.connection.readyState,
    });
  });
}

/**
 * Strips connection strings out of driver messages.
 *
 * Atlas errors can echo the URI, which contains the username, password and
 * cluster hosts. Nothing derived from a connection string reaches a log line,
 * an HTTP response or a health payload.
 */
export function sanitiseMongoMessage(message: string): string {
  return message.replace(/mongodb(\+srv)?:\/\/[^\s"']+/gi, 'mongodb://***');
}

/** The single check the request lifecycle and services should trust. */
export function isDatabaseReady(): boolean {
  return mongoose.connection.readyState === 1;
}

export interface ConnectOptions {
  attempts?: number;
  selectionTimeoutMS?: number;
  retryDelayMs?: number;
}

/**
 * Attempts a MongoDB Atlas connection a bounded number of times.
 *
 * Resolution is intentionally non-fatal: when Atlas is unreachable the API still
 * boots and reports a degraded health status instead of crash-looping.
 */
export async function connectDatabase(uri?: string, options: ConnectOptions = {}): Promise<boolean> {
  registerConnectionListeners();
  mongoose.set('strictQuery', true);

  /*
   * Buffering is what turns a missing connection into a misleading timeout:
   * the query waits, then fails with `buffering timed out` long after the
   * request could have been answered. With buffering off, a query against a
   * disconnected instance fails immediately and surfaces as a 503.
   */
  mongoose.set('bufferCommands', false);

  if (!uri) {
    lastConnectionError = 'MONGODB_URI is not configured';
    logger.warn('Skipping MongoDB connection: MONGODB_URI is not configured', {
      readyState: mongoose.connection.readyState,
    });
    return false;
  }

  const attempts = options.attempts ?? DB_CONNECT_MAX_ATTEMPTS;
  const selectionTimeoutMS = options.selectionTimeoutMS ?? DB_SERVER_SELECTION_TIMEOUT_MS;
  const retryDelayMs = options.retryDelayMs ?? DB_CONNECT_RETRY_DELAY_MS;
  const serverless = isServerlessRuntime();
  const poolSize = serverless ? DB_SERVERLESS_POOL_SIZE : DB_LOCAL_POOL_SIZE;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    logger.info('MongoDB connect attempt started', {
      attempt,
      of: attempts,
      serverless,
      readyState: mongoose.connection.readyState,
      selectionTimeoutMS,
      poolSize,
    });

    try {
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: selectionTimeoutMS,
        connectTimeoutMS: serverless ? DB_SERVERLESS_CONNECT_TIMEOUT_MS : selectionTimeoutMS,
        autoIndex: !isProduction(),
        maxPoolSize: poolSize,
        minPoolSize: 0,
      });
      return true;
    } catch (error) {
      const raw = error instanceof Error ? error.message : String(error);

      lastConnectionError = sanitiseMongoMessage(raw);
      logger.warn('MongoDB connection attempt failed', {
        attempt,
        of: attempts,
        readyState: mongoose.connection.readyState,
        reason: lastConnectionError,
        timedOut: /timed out|server selection/i.test(raw),
      });

      if (attempt < attempts) {
        await sleep(retryDelayMs);
      }
    }
  }

  logger.error('MongoDB unavailable; starting API in degraded mode', {
    reason: lastConnectionError,
  });
  return false;
}

/** Reads MONGODB_URI without throwing when it is missing. */
export function readMongoUri(): string | undefined {
  try {
    return getEnv().MONGODB_URI;
  } catch (error) {
    if (error instanceof EnvValidationError) {
      lastConnectionError = error.message;
      return undefined;
    }

    throw error;
  }
}

let pendingConnection: Promise<boolean> | null = null;

/**
 * Serverless entry point for the database.
 *
 * A warm function instance keeps its Mongoose connection, so the common case is
 * a synchronous `readyState === 1` check. Concurrent requests on a cold instance
 * share one in-flight connection attempt instead of racing to open several.
 * The connection is deliberately never closed: the instance may serve more
 * requests, and closing it would only force a reconnect.
 */
export async function ensureDatabaseConnection(uri?: string): Promise<boolean> {
  registerConnectionListeners();

  if (isDatabaseReady()) {
    logger.debug('MongoDB connection reused', {
      database: mongoose.connection.name,
      readyState: mongoose.connection.readyState,
    });
    return true;
  }

  // A long-lived process may already be dialling; join that attempt instead of
  // opening a second connection.
  if (mongoose.connection.readyState === 2 && !pendingConnection) {
    logger.debug('Joining connection already in progress', { readyState: 2 });
    await mongoose.connection.asPromise().catch(() => undefined);

    if (isDatabaseReady()) return true;
  }

  if (pendingConnection) {
    logger.debug('Awaiting in-flight MongoDB connection attempt', {
      readyState: mongoose.connection.readyState,
    });
    return pendingConnection;
  }

  const resolvedUri = uri ?? readMongoUri();

  if (!resolvedUri) {
    logger.warn('MongoDB connection skipped: MONGODB_URI is not configured', {
      readyState: mongoose.connection.readyState,
    });
    return false;
  }

  pendingConnection = connectDatabase(resolvedUri, {
    attempts: DB_SERVERLESS_MAX_ATTEMPTS,
    selectionTimeoutMS: DB_SERVERLESS_SELECTION_TIMEOUT_MS,
  })
    .then((connected) => {
      logger[connected ? 'info' : 'error']('MongoDB connection lifecycle settled', {
        connected,
        readyState: mongoose.connection.readyState,
        serverless: isServerlessRuntime(),
        reason: connected ? undefined : lastConnectionError,
      });

      // Only a live socket counts as success.
      return connected && isDatabaseReady();
    })
    .finally(() => {
      // Cleared either way: a later request retries instead of inheriting a
      // permanently settled promise.
      pendingConnection = null;
    });

  return pendingConnection;
}

export interface DatabaseFailure {
  status: DatabaseStatus;
  readyState: number;
  lastError: string | null;
}

/** Snapshot used by the 503 response; never contains connection details. */
export function describeDatabaseFailure(): DatabaseFailure {
  const snapshot = getDatabaseSnapshot();

  return {
    status: snapshot.status,
    readyState: snapshot.readyState,
    lastError: snapshot.lastError,
  };
}

/** Test helper: forgets the in-flight attempt so a fresh connect can be observed. */
export function resetDatabaseConnectionState(): void {
  pendingConnection = null;
  lastConnectionError = null;
}

/** Closes the Mongoose connection so the process can exit without open handles. */
export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState === 0) return;

  try {
    await mongoose.disconnect();
    logger.info('MongoDB connection closed');
  } catch (error) {
    logger.error('Failed to close MongoDB connection cleanly', { error });
  }
}

export function getDatabaseSnapshot(): DatabaseSnapshot {
  const { readyState, name, host } = mongoose.connection;

  return {
    status: READY_STATE[readyState] ?? 'disconnected',
    readyState,
    name: name || null,
    host: host || null,
    lastError: lastConnectionError,
  };
}

export function isDatabaseConnected(): boolean {
  return mongoose.connection.readyState === 1;
}
