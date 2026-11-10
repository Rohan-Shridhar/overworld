import { Router } from 'express';
import { getCountry, getProvinces, getWorld } from '../controllers/world.controller.js';
import { validateRequest } from '../middleware/validate-request.js';
import { asyncHandler } from '../utils/async-handler.js';
import { countryCodeParamsSchema, provinceQuerySchema } from '../world/world.schema.js';

export const worldRouter = Router();

worldRouter.get('/', asyncHandler(getWorld));

worldRouter.get(
  '/provinces',
  validateRequest({ query: provinceQuerySchema }),
  asyncHandler(getProvinces),
);

worldRouter.get(
  '/countries/:code',
  validateRequest({ params: countryCodeParamsSchema }),
  asyncHandler(getCountry),
);
