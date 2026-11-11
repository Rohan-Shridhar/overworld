import mongoose from 'mongoose';
import { logger } from '../lib/logger.js';
import {
  DB_BUFFER_TIMEOUT_MS,
  DB_CONNECT_MAX_ATTEMPTS,
  DB_CONNECT_RETRY_DELAY_MS,
  DB_SERVERLESS_MAX_ATTEMPTS,
  DB_SERVERLESS_SELECTION_TIMEOUT_MS,
  DB_SERVER_SELECTION_TIMEOUT_MS,
  isProduction,
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
    logger.info('MongoDB connection established', { database: mongoose.connection.name });
  });

  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB connection lost');
  });

  mongoose.connection.on('error', (error: Error) => {
    lastConnectionError = error.message;
    logger.error('MongoDB connection error', { error });
  });
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
  mongoose.set('bufferTimeoutMS', DB_BUFFER_TIMEOUT_MS);

  if (!uri) {
    lastConnectionError = 'MONGODB_URI is not configured';
    logger.warn('Skipping MongoDB connection: MONGODB_URI is not configured');
    return false;
  }

  const attempts = options.attempts ?? DB_CONNECT_MAX_ATTEMPTS;
  const selectionTimeoutMS = options.selectionTimeoutMS ?? DB_SERVER_SELECTION_TIMEOUT_MS;
  const retryDelayMs = options.retryDelayMs ?? DB_CONNECT_RETRY_DELAY_MS;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: selectionTimeoutMS,
        autoIndex: !isProduction(),
        maxPoolSize: 10,
      });
      return true;
    } catch (error) {
      lastConnectionError = error instanceof Error ? error.message : String(error);
      logger.warn('MongoDB connection attempt failed', {
        attempt,
        of: attempts,
        reason: lastConnectionError,
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

  if (mongoose.connection.readyState === 1) return true;

  if (pendingConnection) return pendingConnection;

  pendingConnection = connectDatabase(uri ?? readMongoUri(), {
    attempts: DB_SERVERLESS_MAX_ATTEMPTS,
    selectionTimeoutMS: DB_SERVERLESS_SELECTION_TIMEOUT_MS,
  }).finally(() => {
    // Cleared either way: a later request retries instead of inheriting a
    // permanently rejected promise.
    pendingConnection = null;
  });

  return pendingConnection;
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
