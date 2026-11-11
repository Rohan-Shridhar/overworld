import mongoose from 'mongoose';
import {
  APP_NAME,
  APP_VERSION,
  DB_HEALTH_QUERY_TIMEOUT_MS,
  SOCKET_PATH,
  isProduction,
} from '../config/constants.js';
import { getDatabaseSnapshot, isDatabaseConnected, type DatabaseStatus } from '../config/database.js';
import { getSocketClientCount } from '../config/socket.js';
import { logger } from '../lib/logger.js';
import { ScenarioModel } from '../models/scenario.model.js';

export type HealthDetail = 'summary' | 'full';

export type SystemStatus = 'ok' | 'degraded';

export interface HealthReport {
  status: SystemStatus;
  app: {
    name: string;
    version: string;
    environment: string;
    startedAt: string;
  };
  uptimeSeconds: number;
  database: {
    status: DatabaseStatus;
    connected: boolean;
    latencyMs: number | null;
    scenarioCount: number | null;
    databaseName: string | null;
    lastError: string | null;
  };
  realtime: {
    transport: 'socket.io';
    path: string;
    connectedClients: number;
  };
  checkedAt: string;
}

const startedAt = new Date();

async function measureDatabaseLatency(): Promise<number | null> {
  const connection = mongoose.connection.db;

  if (!connection) return null;

  const startedAtNs = process.hrtime.bigint();
  await connection.admin().ping();
  const elapsedNs = process.hrtime.bigint() - startedAtNs;

  return Math.round(Number(elapsedNs) / 1_000_000);
}

async function countScenarios(): Promise<number | null> {
  try {
    return await ScenarioModel.countDocuments().maxTimeMS(DB_HEALTH_QUERY_TIMEOUT_MS).exec();
  } catch (error) {
    logger.warn('Health check could not count scenarios', {
      error: error instanceof Error ? error : String(error),
    });
    return null;
  }
}

/**
 * Builds the health report served by `GET /api/health`.
 *
 * `summary` reflects connection state only; `full` additionally probes the
 * database with a ping and a bounded count query.
 */
export async function buildHealthReport(detail: HealthDetail = 'summary'): Promise<HealthReport> {
  const snapshot = getDatabaseSnapshot();
  const connected = isDatabaseConnected();

  let latencyMs: number | null = null;
  let scenarioCount: number | null = null;

  if (connected) {
    try {
      latencyMs = await measureDatabaseLatency();
    } catch (error) {
      logger.warn('Health check ping failed', {
        error: error instanceof Error ? error : String(error),
      });
    }

    if (detail === 'full') {
      scenarioCount = await countScenarios();
    }
  }

  return {
    status: connected ? 'ok' : 'degraded',
    app: {
      name: APP_NAME,
      version: APP_VERSION,
      environment: process.env.NODE_ENV ?? 'development',
      startedAt: startedAt.toISOString(),
    },
    uptimeSeconds: Math.floor(process.uptime()),
    database: {
      status: snapshot.status,
      connected,
      latencyMs,
      scenarioCount,
      databaseName: snapshot.name,
      // Connection strings can leak credentials; only surface the raw reason locally.
      lastError: isProduction() ? null : snapshot.lastError,
    },
    realtime: {
      transport: 'socket.io',
      path: SOCKET_PATH,
      connectedClients: getSocketClientCount(),
    },
    checkedAt: new Date().toISOString(),
  };
}
