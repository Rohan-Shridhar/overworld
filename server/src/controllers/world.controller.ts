import type { Request, Response } from 'express';
import {
  getValidatedBody,
  getValidatedParams,
  getValidatedQuery,
} from '../middleware/validate-request.js';
import {
  createCountry,
  createProvince,
  deleteCountry,
  getCountryProfile,
  getCountryProvinces,
  transferProvince,
  updateCountry,
  updateProvince,
  type CountryInput,
  type ProvinceInput,
} from '../world/country.service.js';
import type {
  CountryBody,
  CountryCodeParams,
  CountryUpdateBody,
  ProvinceBody,
  ProvinceIdParams,
  ProvinceQuery,
  ProvinceUpdateBody,
  TransferBody,
} from '../world/world.schema.js';
import { getProvinceFeatures, getWorldMap } from '../world/world.service.js';

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

/** GET /api/world/countries/:code — full dossier for every profile tab. */
export async function getCountryProfileHandler(_request: Request, res: Response): Promise<void> {
  const params = getValidatedParams<CountryCodeParams>(res);
  const [country, provinces] = await Promise.all([
    getCountryProfile(params.code),
    getCountryProvinces(params.code),
  ]);

  res.json({ success: true, data: { country, provinces } });
}

/** POST /api/world/countries — administrative creation inside a continent. */
export async function createCountryHandler(_request: Request, res: Response): Promise<void> {
  const body = getValidatedBody<CountryBody>(res);
  const country = await createCountry(body as CountryInput);

  res.status(201).json({ success: true, data: { country } });
}

/** PATCH /api/world/countries/:code — administrative edit of any statistics. */
export async function updateCountryHandler(_request: Request, res: Response): Promise<void> {
  const params = getValidatedParams<CountryCodeParams>(res);
  const body = getValidatedBody<CountryUpdateBody>(res);
  const country = await updateCountry(params.code, body as Partial<CountryInput>);

  res.json({ success: true, data: { country } });
}

/** DELETE /api/world/countries/:code — removes a state and its provinces. */
export async function deleteCountryHandler(_request: Request, res: Response): Promise<void> {
  const params = getValidatedParams<CountryCodeParams>(res);
  const removedProvinces = await deleteCountry(params.code);

  res.status(200).json({ success: true, data: { removedProvinces } });
}

/** POST /api/world/countries/:code/provinces — adds a province to a state. */
export async function createProvinceHandler(_request: Request, res: Response): Promise<void> {
  const params = getValidatedParams<CountryCodeParams>(res);
  const body = getValidatedBody<ProvinceBody>(res);
  const province = await createProvince(params.code, body as ProvinceInput);

  res.status(201).json({ success: true, data: { province } });
}

/** PATCH /api/world/provinces/:id — edits a province's statistics. */
export async function updateProvinceHandler(_request: Request, res: Response): Promise<void> {
  const params = getValidatedParams<ProvinceIdParams>(res);
  const body = getValidatedBody<ProvinceUpdateBody>(res);
  const province = await updateProvince(params.id, body as Partial<ProvinceInput>);

  res.json({ success: true, data: { province } });
}

/** POST /api/world/provinces/:id/transfer — moves a province to another state. */
export async function transferProvinceHandler(_request: Request, res: Response): Promise<void> {
  const params = getValidatedParams<ProvinceIdParams>(res);
  const body = getValidatedBody<TransferBody>(res);
  const result = await transferProvince(params.id, body.targetCode);

  res.json({ success: true, data: result });
}
