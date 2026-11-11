import type { RequestHandler } from 'express';
import { API_PREFIX } from '../config/constants.js';
import { describeDatabaseFailure, isDatabaseReady } from '../config/database.js';
import { logger } from '../lib/logger.js';

/** Health must answer while the database is down; everything else must not. */
function isHealthRequest(path: string): boolean {
  return path.startsWith(`${API_PREFIX}/health`);
}

export interface DatabaseGateOptions {
  /** Resolves true only when a real connection is established. */
  ensure: () => Promise<boolean>;
}

/**
 * Request-time database gate.
 *
 * A serverless function has no boot phase: the instance is created, the module
 * is imported, and a request arrives immediately. This middleware makes the
 * connection part of the request lifecycle — reuse if warm, connect if cold,
 * refuse with a controlled 503 if it cannot be established — so no controller
 * can ever issue a query against a disconnected Mongoose instance.
 */
export function databaseReady({ ensure }: DatabaseGateOptions): RequestHandler {
  return async (request, response, next) => {
    if (isHealthRequest(request.path)) {
      next();
      return;
    }

    if (isDatabaseReady()) {
      next();
      return;
    }

    const startedAt = Date.now();
    let ready = false;

    try {
      ready = await ensure();
    } catch (error) {
      logger.error('Database connection could not be established', {
        reason: error instanceof Error ? error.name : 'unknown',
      });
    }

    /*
     * `ensure` is the contract: it resolves true only after the socket is open
     * (see `ensureDatabaseConnection`, which re-checks `readyState`). The gate
     * must not second-guess an injected connector, or tests and alternative
     * runtimes could never exercise the healthy path.
     */
    if (ready) {
      logger.debug('Database connection ready for request', {
        method: request.method,
        path: request.path,
        waitedMs: Date.now() - startedAt,
      });
      next();
      return;
    }

    const failure = describeDatabaseFailure();

    logger.error('Refusing request: database unavailable', {
      method: request.method,
      path: request.path,
      waitedMs: Date.now() - startedAt,
      readyState: failure.readyState,
      status: failure.status,
      reason: failure.lastError,
    });

    response.status(503).json({
      success: false,
      error: {
        code: 'DATABASE_UNAVAILABLE',
        message: 'The database is not reachable. Try again in a moment.',
        details: {
          status: failure.status,
          readyState: failure.readyState,
          reason: failure.lastError,
        },
      },
    });
  };
}
