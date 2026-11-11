import mongoose from 'mongoose';
import { logger } from '../lib/logger.js';
import {
  DB_CONNECT_MAX_ATTEMPTS,
  DB_CONNECT_RETRY_DELAY_MS,
  DB_SERVER_SELECTION_TIMEOUT_MS,
  isProduction,
} from './constants.js';

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

/**
 * Attempts a MongoDB Atlas connection a bounded number of times.
 *
 * Resolution is intentionally non-fatal: when Atlas is unreachable the API still
 * boots and reports a degraded health status instead of crash-looping.
 */
export async function connectDatabase(uri?: string): Promise<boolean> {
  registerConnectionListeners();
  mongoose.set('strictQuery', true);

  if (!uri) {
    lastConnectionError = 'MONGODB_URI is not configured';
    logger.warn('Skipping MongoDB connection: MONGODB_URI is not configured');
    return false;
  }

  for (let attempt = 1; attempt <= DB_CONNECT_MAX_ATTEMPTS; attempt += 1) {
    try {
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: DB_SERVER_SELECTION_TIMEOUT_MS,
        autoIndex: !isProduction(),
        maxPoolSize: 10,
      });
      return true;
    } catch (error) {
      lastConnectionError = error instanceof Error ? error.message : String(error);
      logger.warn('MongoDB connection attempt failed', {
        attempt,
        of: DB_CONNECT_MAX_ATTEMPTS,
        reason: lastConnectionError,
      });

      if (attempt < DB_CONNECT_MAX_ATTEMPTS) {
        await sleep(DB_CONNECT_RETRY_DELAY_MS);
      }
    }
  }

  logger.error('MongoDB unavailable; starting API in degraded mode', {
    reason: lastConnectionError,
  });
  return false;
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
