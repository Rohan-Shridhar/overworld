import { Router } from 'express';
import { validateRequest } from '../middleware/validate-request.js';
import { asyncHandler } from '../utils/async-handler.js';
import {
  advanceSimulationHandler,
  getSimulationEventsHandler,
  getSimulationHandler,
  updateSimulationHandler,
} from './simulation.controller.js';
import {
  simulationAdvanceSchema,
  simulationEventsQuerySchema,
  simulationSettingsSchema,
} from './simulation.schema.js';

/**
 * Simulation HTTP surface. Mounted at `/api/simulation`.
 *
 * Mounting this router is what makes the engine reachable at all; before the
 * deployment migration the controller existed but no router referenced it.
 */
export const simulationRouter = Router();

simulationRouter.get('/', asyncHandler(getSimulationHandler));

simulationRouter.patch(
  '/',
  validateRequest({ body: simulationSettingsSchema }),
  asyncHandler(updateSimulationHandler),
);

simulationRouter.post(
  '/advance',
  validateRequest({ body: simulationAdvanceSchema }),
  asyncHandler(advanceSimulationHandler),
);

simulationRouter.get(
  '/events',
  validateRequest({ query: simulationEventsQuerySchema }),
  asyncHandler(getSimulationEventsHandler),
);
