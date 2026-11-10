import { Router } from 'express';
import { API_PREFIX, APP_NAME, APP_VERSION } from '../config/constants.js';
import { healthRouter } from './health.routes.js';

/**
 * Root API router. Feature routers are mounted here as the simulation engine grows.
 */
export const apiRouter = Router();

apiRouter.get('/', (_req, res) => {
  res.json({
    success: true,
    data: {
      name: APP_NAME,
      version: APP_VERSION,
      endpoints: [
        { method: 'GET', path: `${API_PREFIX}/health`, description: 'Service and database health' },
      ],
    },
  });
});

apiRouter.use('/health', healthRouter);
