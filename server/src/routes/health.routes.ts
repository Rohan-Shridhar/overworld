import { Router } from 'express';
import { getHealth } from '../controllers/health.controller.js';
import { validateRequest } from '../middleware/validate-request.js';
import { healthQuerySchema } from '../schemas/health.schema.js';
import { asyncHandler } from '../utils/async-handler.js';

export const healthRouter = Router();

healthRouter.get('/', validateRequest({ query: healthQuerySchema }), asyncHandler(getHealth));
