import { Types } from 'mongoose';
import { CountryModel, type Country } from '../models/country.model.js';
import { ProvinceModel, type Province } from '../models/province.model.js';
import { AppError } from '../utils/app-error.js';
import {
  createRadialRing,
  geometryArea,
  pointInRing,
  polygonCentroid,
  samplePointsInRing,
  type Geometry,
  type Position,
} from './generator/geometry.js';
import { createRandom } from './generator/seeded-random.js';
import { buildContinentRings } from './generator/world-generator.js';
import { DEFAULT_WORLD_SEED } from './world.constants.js';
import { ensureDefaultWorld } from './world.service.js';
import type { CountryProfile, ProvinceSummary } from './world.types.js';

type LeanCountry = Country & { _id: Types.ObjectId };
type LeanProvince = Province & { _id: Types.ObjectId };

export interface CountryInput {
  name: string;
  shortCode?: string;
  flag: string;
  capital: string;
  colour: string;
  continent: string;
  population: number;
  gdp: number;
  governmentType: string;
  leader: string;
  stability: number;
  description?: string;
  resources?: string[];
  economy?: Partial<CountryProfile['economy']>;
  military?: Partial<CountryProfile['military']>;
  government?: Partial<CountryProfile['government']>;
}

export interface ProvinceInput {
  name: string;
  population: number;
  terrain: string;
  resources: string[];
  infrastructure: number;
}

function ringsOf(geometry: Geometry): Position[][] {
  return geometry.type === 'Polygon' ? geometry.coordinates : geometry.coordinates.flat();
}

function geometryContains(geometry: Geometry, point: Position): boolean {
  return ringsOf(geometry).some((ring) => pointInRing(point, ring));
}

/** Area is always derived from the provinces that currently belong to the country. */
async function syncCountryArea(countryId: Types.ObjectId): Promise<void> {
  const provinces = await ProvinceModel.find({ countryId }).lean();
  const area = provinces.reduce(
    (total, province) => total + ((province as { area?: number }).area ?? 0),
    0,
  );

  await CountryModel.updateOne(
    { _id: countryId },
    { $set: { area: Math.round(area * 100) / 100 } },
  );
}

function toProvinceSummary(province: LeanProvince): ProvinceSummary {
  return {
    id: String(province._id),
    name: province.name,
    population: province.population,
    terrain: province.terrain,
    resources: province.resources ?? [],
    infrastructure: province.infrastructure,
    currentOwner: province.currentOwner,
    currentController: province.currentController,
    area: province.area ?? 0,
  };
}

function toProfile(country: LeanCountry): CountryProfile {
  return {
    id: String(country._id),
    code: country.shortCode,
    name: country.name,
    capital: country.capital,
    continent: country.continent,
    colour: country.colour,
    flag: country.flag,
    population: country.population,
    gdp: country.gdp,
    governmentType: country.governmentType,
    leader: country.leader,
    stability: country.stability,
    provinceCount: 0,
    centroid: (country.centroid ?? [0, 0]) as Position,
    description: country.description ?? '',
    area: country.area ?? 0,
    resources: country.resources ?? [],
    isAdminEdited: country.isAdminEdited ?? false,
    economy: {
      gdpGrowth: country.economy?.gdpGrowth ?? 0,
      inflation: country.economy?.inflation ?? 0,
      debt: country.economy?.debt ?? 0,
      currency: country.economy?.currency ?? 'Credits',
      tradeBalance: country.economy?.tradeBalance ?? 0,
      resourceProduction: (country.economy?.resourceProduction ?? []).map((entry) => ({
        resource: entry.resource,
        output: entry.output,
        unit: entry.unit ?? 'kt',
      })),
    },
    military: {
      personnel: country.military?.personnel ?? 0,
      army: country.military?.army ?? 0,
      navy: country.military?.navy ?? 0,
      airForce: country.military?.airForce ?? 0,
      equipment: {
        tanks: country.military?.equipment?.tanks ?? 0,
        aircraft: country.military?.equipment?.aircraft ?? 0,
        ships: country.military?.equipment?.ships ?? 0,
        artillery: country.military?.equipment?.artillery ?? 0,
      },
      bases: (country.military?.bases ?? []).map((base) => ({
        name: base.name,
        province: base.province ?? '',
        branch: (base.branch ?? 'army') as 'army' | 'navy' | 'air',
        personnel: base.personnel ?? 0,
      })),
      deployments: (country.military?.deployments ?? []).map((deployment) => ({
        name: deployment.name,
        province: deployment.province ?? '',
        strength: deployment.strength ?? 0,
        status: (deployment.status ?? 'garrison') as 'garrison' | 'deployed' | 'exercising',
      })),
    },
    diplomacy: {
      status: country.diplomacy?.status ?? 'Neutral',
      alliances: country.diplomacy?.alliances ?? [],
      treaties: (country.diplomacy?.treaties ?? []).map((treaty) => ({
        name: treaty.name,
        partner: treaty.partner,
        signedAt: new Date(treaty.signedAt).toISOString(),
      })),
      rivals: country.diplomacy?.rivals ?? [],
      sanctions: country.diplomacy?.sanctions ?? [],
      tradePartners: country.diplomacy?.tradePartners ?? [],
    },
    government: {
      environment: country.government?.environment ?? 'Stable',
      ideology: country.government?.ideology ?? 'Pragmatic',
      rulingParty: country.government?.rulingParty ?? 'Civic Union',
      nextElection: country.government?.nextElection
        ? new Date(country.government.nextElection).toISOString()
        : null,
    },
    history: (country.history ?? []).map((entry) => ({
      at: new Date(entry.at).toISOString(),
      title: entry.title,
      detail: entry.detail ?? '',
      kind: (entry.kind ?? 'foundation') as 'foundation' | 'government' | 'territory' | 'administration',
    })),
  };
}

async function findCountry(worldId: Types.ObjectId, code: string): Promise<LeanCountry> {
  const country = (await CountryModel.findOne({
    worldId,
    shortCode: code.toUpperCase(),
  }).lean()) as unknown as LeanCountry | null;

  if (!country) throw AppError.notFound(`No country with the code "${code.toUpperCase()}"`);

  return country;
}

/** Full profile for the country panel: every tab's data in one payload. */
export async function getCountryProfile(code: string): Promise<CountryProfile> {
  const world = await ensureDefaultWorld();
  const country = await findCountry(world._id, code);
  const provinces = (await ProvinceModel.find({ countryId: country._id }).sort({ name: 1 }).lean()) as unknown as LeanProvince[];

  return { ...toProfile(country), provinceCount: provinces.length };
}

export async function getCountryProvinces(code: string): Promise<ProvinceSummary[]> {
  const world = await ensureDefaultWorld();
  const country = await findCountry(world._id, code);
  const provinces = (await ProvinceModel.find({ countryId: country._id }).sort({ name: 1 }).lean()) as unknown as LeanProvince[];

  return provinces.map(toProvinceSummary);
}

/** Finds space inside a continent that no existing country occupies. */
async function claimTerritory(
  worldId: Types.ObjectId,
  continentName: string,
): Promise<{ geometry: Geometry; centroid: Position; continent: string }> {
  const continent = buildContinentRings(DEFAULT_WORLD_SEED).find(
    (entry) => entry.name.toLowerCase() === continentName.toLowerCase(),
  );

  if (!continent) {
    throw AppError.badRequest(`"${continentName}" is not a continent in this world`);
  }

  const existing = (await CountryModel.find({ worldId }).lean()) as unknown as LeanCountry[];
  const random = createRandom(`claim:${continentName}:${existing.length}`);

  const ring = (continent.geometry as { type: 'Polygon'; coordinates: Position[][] }).coordinates[0] as Position[];
  const candidates = samplePointsInRing(ring, 40, random, 0);

  for (const candidate of candidates) {
    const occupied = existing.some((country) =>
      geometryContains(country.geometry as unknown as Geometry, candidate),
    );

    if (occupied) continue;

    const radiusLon = random.range(1.6, 3.4);
    const radiusLat = random.range(1.2, 2.4);
    const geometry: Geometry = {
      type: 'Polygon',
      coordinates: [createRadialRing(candidate, radiusLon, radiusLat, 12, random, 0.28)],
    };

    return { geometry, centroid: polygonCentroid(geometry), continent: continent.name };
  }

  throw AppError.badRequest(
    `No unclaimed territory remains on ${continent.name}. Choose another continent.`,
  );
}

export async function createCountry(input: CountryInput): Promise<CountryProfile> {
  const world = await ensureDefaultWorld();
  const territory = await claimTerritory(world._id, input.continent);
  const derivedCode = input.name.replace(/[^a-z]/gi, '').slice(0, 3) || 'UNK';
  const code = (input.shortCode ?? derivedCode).toUpperCase();

  const existing = await CountryModel.findOne({ worldId: world._id, shortCode: code }).lean();

  if (existing) throw AppError.badRequest(`Country code "${code}" is already in use`);

  const created = (await CountryModel.create({
    worldId: world._id,
    name: input.name,
    shortCode: code,
    flag: input.flag,
    capital: input.capital,
    continent: territory.continent,
    description: input.description ?? '',
    colour: input.colour,
    population: input.population,
    gdp: input.gdp,
    governmentType: input.governmentType,
    leader: input.leader,
    stability: input.stability,
    geometry: territory.geometry,
    centroid: territory.centroid,
    area: Math.round(geometryArea(territory.geometry) * 100) / 100,
    resources: input.resources ?? [],
    economy: { ...input.economy },
    military: { ...input.military },
    government: { ...input.government },
    diplomacy: { status: 'Neutral', alliances: [], treaties: [], rivals: [], sanctions: [], tradePartners: [] },
    history: [
      {
        at: new Date(),
        title: 'State admitted',
        detail: `${input.name} was created by administrative action on ${territory.continent}.`,
        kind: 'foundation',
      },
    ],
    isAdminEdited: true,
  })) as unknown as LeanCountry;

  return { ...toProfile(created), provinceCount: 0 };
}

export async function updateCountry(
  code: string,
  input: Partial<CountryInput>,
): Promise<CountryProfile> {
  const world = await ensureDefaultWorld();
  const country = await findCountry(world._id, code);
  const changes: Record<string, unknown> = {};
  const changedFields = [
    'name',
    'flag',
    'capital',
    'colour',
    'population',
    'gdp',
    'governmentType',
    'leader',
    'stability',
    'description',
    'resources',
  ] as const;

  for (const field of changedFields) {
    const value = input[field];

    if (value === undefined) continue;

    changes[field] = value;
  }

  if (input.economy) {
    for (const [key, value] of Object.entries(input.economy)) {
      if (value !== undefined) changes[`economy.${key}`] = value;
    }
  }

  if (input.military) {
    for (const [key, value] of Object.entries(input.military)) {
      if (value !== undefined) changes[`military.${key}`] = value;
    }
  }

  if (input.government) {
    for (const [key, value] of Object.entries(input.government)) {
      if (value !== undefined) changes[`government.${key}`] = value;
    }
  }

  if (Object.keys(changes).length === 0) {
    throw AppError.badRequest('No supported fields were provided');
  }

  if (changes.name !== undefined) {
    await ProvinceModel.updateMany({ countryId: country._id }, { $set: { currentOwner: changes.name } });
  }

  const updated = (await CountryModel.findOneAndUpdate(
    { _id: country._id },
    {
      $set: { ...changes, isAdminEdited: true },
      $push: {
        history: {
          at: new Date(),
          title: 'Administrative edit',
          detail: `Fields updated: ${Object.keys(changes).join(', ')}.`,
          kind: 'administration',
        },
      },
    },
    { new: true },
  ).lean()) as unknown as LeanCountry;

  return { ...toProfile(updated), provinceCount: 0 };
}

export async function deleteCountry(code: string): Promise<number> {
  const world = await ensureDefaultWorld();
  const remaining = await CountryModel.countDocuments({ worldId: world._id });

  if (remaining <= 1) {
    throw AppError.badRequest('The last country in the world cannot be removed');
  }

  const country = await findCountry(world._id, code);
  const removedProvinces = await ProvinceModel.deleteMany({ countryId: country._id });

  await CountryModel.deleteOne({ _id: country._id });

  return removedProvinces.deletedCount ?? 0;
}

/** Adds a province to an existing country, carving a cell out of its own territory. */
export async function createProvince(code: string, input: ProvinceInput): Promise<ProvinceSummary> {
  const world = await ensureDefaultWorld();
  const country = await findCountry(world._id, code);
  const geometry = country.geometry as unknown as Geometry;
  const ring = ringsOf(geometry)[0];

  if (!ring) throw AppError.badRequest('This country has no territory to subdivide');

  const random = createRandom(`province:${country.shortCode}:${Date.now()}`);
  const [seed] = samplePointsInRing(ring, 1, random, 0);

  if (!seed) throw AppError.badRequest('Could not place a province inside this country');

  const provinceGeometry: Geometry = {
    type: 'Polygon',
    coordinates: [createRadialRing(seed, random.range(0.6, 1.6), random.range(0.5, 1.2), 10, random, 0.3)],
  };

  const created = await ProvinceModel.create({
    worldId: world._id,
    countryId: country._id,
    name: input.name,
    geometry: provinceGeometry,
    centroid: polygonCentroid(provinceGeometry),
    population: input.population,
    resources: input.resources,
    terrain: input.terrain,
    infrastructure: input.infrastructure,
    currentOwner: country.name,
    currentController: country.name,
    area: Math.round(geometryArea(provinceGeometry) * 1000) / 1000,
  });

  await CountryModel.updateOne(
    { _id: country._id },
    {
      $push: {
        history: {
          at: new Date(),
          title: `Province created: ${input.name}`,
          detail: 'Added by administrative action.',
          kind: 'territory',
        },
      },
    },
  );
  await syncCountryArea(country._id);

  return toProvinceSummary(created as unknown as LeanProvince);
}

export async function updateProvince(
  provinceId: string,
  input: Partial<ProvinceInput>,
): Promise<ProvinceSummary> {
  if (!Types.ObjectId.isValid(provinceId)) {
    throw AppError.badRequest('province id must be a valid identifier');
  }

  const updated = await ProvinceModel.findByIdAndUpdate(
    provinceId,
    { $set: { ...input } },
    { new: true },
  ).lean();

  if (!updated) throw AppError.notFound('No province with that identifier');

  return toProvinceSummary(updated as unknown as LeanProvince);
}

/** Administrative transfer: ownership and control move together. */
export async function transferProvince(
  provinceId: string,
  targetCode: string,
): Promise<{ province: ProvinceSummary; from: string; to: string }> {
  if (!Types.ObjectId.isValid(provinceId)) {
    throw AppError.badRequest('province id must be a valid identifier');
  }

  const world = await ensureDefaultWorld();
  const province = (await ProvinceModel.findById(provinceId).lean()) as unknown as LeanProvince | null;

  if (!province) throw AppError.notFound('No province with that identifier');

  const target = await findCountry(world._id, targetCode);

  if (String(target._id) === String(province.countryId)) {
    throw AppError.badRequest(`Province is already part of ${target.name}`);
  }

  const previousCountryId = province.countryId as Types.ObjectId;

  await ProvinceModel.updateOne(
    { _id: province._id },
    { $set: { countryId: target._id, currentOwner: target.name, currentController: target.name } },
  );

  await CountryModel.updateOne(
    { _id: target._id },
    {
      $push: {
        history: {
          at: new Date(),
          title: `Province acquired: ${province.name}`,
          detail: `Transferred from the previous owner by administrative action.`,
          kind: 'territory',
        },
      },
    },
  );

  await CountryModel.updateOne(
    { _id: previousCountryId },
    {
      $push: {
        history: {
          at: new Date(),
          title: `Province ceded: ${province.name}`,
          detail: `Now administered by ${target.name}.`,
          kind: 'territory',
        },
      },
    },
  );

  await syncCountryArea(target._id);
  await syncCountryArea(previousCountryId);

  const updated = (await ProvinceModel.findById(provinceId).lean()) as unknown as LeanProvince;
  const previousOwner = province.currentOwner;

  return {
    province: toProvinceSummary(updated),
    from: previousOwner,
    to: target.name,
  };
}


