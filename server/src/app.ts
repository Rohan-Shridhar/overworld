import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { API_PREFIX, REQUEST_BODY_LIMIT, isAllowedOrigin, isTest } from './config/constants.js';
import { ensureDatabaseConnection } from './config/database.js';
import { databaseReady } from './middleware/database-ready.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { requestLogger } from './middleware/request-logger.js';
import { apiRouter } from './routes/index.js';

export interface AppOptions {
  /** Injected by tests to decide the outcome without touching Atlas. */
  ensureDatabase?: () => Promise<boolean>;
  /**
   * Whether routes wait for MongoDB before running.
   *
   * Defaults to `true` everywhere except the test runner, which exercises
   * handlers that deliberately run without a database.
   */
  requireDatabase?: boolean;
}

/**
 * Builds the Express application without starting a listener, so the same
 * instance can be exercised directly by Supertest.
 */
export function createApp(options: AppOptions = {}): Express {
  const app = express();
  const requireDatabase = options.requireDatabase ?? !isTest();
  const ensureDatabase = options.ensureDatabase ?? (() => ensureDatabaseConnection());

  app.disable('x-powered-by');

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  // Same-origin deployments send no Origin on reads and are allowed implicitly;
  // explicit origins are checked against the allow-list instead of a wildcard.
  app.use(
    cors({
      origin: (origin, callback) => {
        callback(null, isAllowedOrigin(origin));
      },
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      credentials: false,
    }),
  );

  app.use(express.json({ limit: REQUEST_BODY_LIMIT }));
  app.use(express.urlencoded({ extended: true, limit: REQUEST_BODY_LIMIT }));
  app.use(requestLogger);

  /*
   * Connect (or reuse) before routing. A serverless invocation has no boot
   * phase, so this is the only place that can guarantee the connection exists
   * before a controller issues its first query.
   */
  if (requireDatabase) {
    app.use(databaseReady({ ensure: ensureDatabase }));
  }

  app.use(API_PREFIX, apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

/**
 * Default export for hosts that load a module and expect an Express app rather
 * than a factory — Vercel's Express service is one. It creates no listener, so
 * importing this module is still side-effect free for tests and `server.ts`.
 */
export default createApp();
