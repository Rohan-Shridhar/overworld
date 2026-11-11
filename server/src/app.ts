import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { ALLOWED_ORIGINS, API_PREFIX, REQUEST_BODY_LIMIT } from './config/constants.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { requestLogger } from './middleware/request-logger.js';
import { apiRouter } from './routes/index.js';

/**
 * Builds the Express application without starting a listener, so the same
 * instance can be exercised directly by Supertest.
 */
export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  app.use(
    cors({
      origin: [...ALLOWED_ORIGINS],
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      credentials: false,
    }),
  );

  app.use(express.json({ limit: REQUEST_BODY_LIMIT }));
  app.use(express.urlencoded({ extended: true, limit: REQUEST_BODY_LIMIT }));
  app.use(requestLogger);

  app.use(API_PREFIX, apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
