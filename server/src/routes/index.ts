import { Router } from 'express';
import { API_PREFIX, APP_NAME, APP_VERSION } from '../config/constants.js';
import { diplomacyRouter } from '../diplomacy/diplomacy.routes.js';
import { eventRouter, snapshotRouter } from '../events/event.routes.js';
import { healthRouter } from './health.routes.js';
import { worldRouter } from './world.routes.js';

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
        { method: 'GET', path: `${API_PREFIX}/world`, description: 'World metadata and country features' },
        { method: 'GET', path: `${API_PREFIX}/world/provinces`, description: 'Province boundary features' },
        {
          method: 'GET',
          path: `${API_PREFIX}/world/countries/:code`,
          description: 'Country detail with its provinces',
        },
      ],
    },
  });
});

apiRouter.use('/health', healthRouter);
apiRouter.use('/world', worldRouter);
apiRouter.use('/diplomacy', diplomacyRouter);
apiRouter.use('/events', eventRouter);
apiRouter.use('/snapshots', snapshotRouter);
