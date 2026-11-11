import { Router } from 'express';
import {
  createCountryHandler,
  createProvinceHandler,
  deleteCountryHandler,
  getCountryProfileHandler,
  getProvinces,
  getWorld,
  transferProvinceHandler,
  updateCountryHandler,
  updateProvinceHandler,
} from '../controllers/world.controller.js';
import { validateRequest } from '../middleware/validate-request.js';
import { asyncHandler } from '../utils/async-handler.js';
import {
  countryBodySchema,
  countryCodeParamsSchema,
  countryUpdateSchema,
  provinceBodySchema,
  provinceIdParamsSchema,
  provinceQuerySchema,
  provinceUpdateSchema,
  transferBodySchema,
} from '../world/world.schema.js';

export const worldRouter = Router();

worldRouter.get('/', asyncHandler(getWorld));

worldRouter.get(
  '/provinces',
  validateRequest({ query: provinceQuerySchema }),
  asyncHandler(getProvinces),
);

worldRouter.patch(
  '/provinces/:id',
  validateRequest({ params: provinceIdParamsSchema, body: provinceUpdateSchema }),
  asyncHandler(updateProvinceHandler),
);

worldRouter.post(
  '/provinces/:id/transfer',
  validateRequest({ params: provinceIdParamsSchema, body: transferBodySchema }),
  asyncHandler(transferProvinceHandler),
);

worldRouter.post(
  '/countries',
  validateRequest({ body: countryBodySchema }),
  asyncHandler(createCountryHandler),
);

worldRouter.get(
  '/countries/:code',
  validateRequest({ params: countryCodeParamsSchema }),
  asyncHandler(getCountryProfileHandler),
);

worldRouter.patch(
  '/countries/:code',
  validateRequest({ params: countryCodeParamsSchema, body: countryUpdateSchema }),
  asyncHandler(updateCountryHandler),
);

worldRouter.delete(
  '/countries/:code',
  validateRequest({ params: countryCodeParamsSchema }),
  asyncHandler(deleteCountryHandler),
);

worldRouter.post(
  '/countries/:code/provinces',
  validateRequest({ params: countryCodeParamsSchema, body: provinceBodySchema }),
  asyncHandler(createProvinceHandler),
);
