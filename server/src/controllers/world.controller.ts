import type { Request, Response } from 'express';
import { getValidatedParams, getValidatedQuery } from '../middleware/validate-request.js';
import type { CountryCodeParams, ProvinceQuery } from '../world/world.schema.js';
import { getCountryDetail, getProvinceFeatures, getWorldMap } from '../world/world.service.js';

/** GET /api/world — world metadata plus every country as a GeoJSON feature. */
export async function getWorld(_request: Request, res: Response): Promise<void> {
  const payload = await getWorldMap();

  res.json({ success: true, data: payload });
}

/** GET /api/world/provinces — province boundaries, optionally scoped to one country. */
export async function getProvinces(_request: Request, res: Response): Promise<void> {
  const query = getValidatedQuery<ProvinceQuery>(res);
  const provinces = await getProvinceFeatures(query?.countryId);

  res.json({ success: true, data: provinces });
}

/** GET /api/world/countries/:code — detail panel payload. */
export async function getCountry(_request: Request, res: Response): Promise<void> {
  const params = getValidatedParams<CountryCodeParams>(res);
  const detail = await getCountryDetail(params.code);

  res.json({ success: true, data: detail });
}
