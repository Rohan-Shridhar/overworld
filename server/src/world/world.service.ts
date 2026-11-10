import { Types } from 'mongoose';
import { CountryModel, type Country } from '../models/country.model.js';
import { ProvinceModel, type Province } from '../models/province.model.js';
import { WorldModel, type World } from '../models/world.model.js';
import { AppError } from '../utils/app-error.js';
import { generateWorld, type GeneratedWorld } from './generator/world-generator.js';
import type { Geometry, Position } from './generator/geometry.js';
import { backfillCountryProfiles } from './profile-backfill.js';
import { DEFAULT_WORLD_SEED, DEFAULT_WORLD_SLUG } from './world.constants.js';
import type {
  CountryFeatureProperties,
  FeatureCollection,
  ProvinceFeatureProperties,
  WorldMapPayload,
  WorldSummary,
} from './world.types.js';

type LeanWorld = World & { _id: Types.ObjectId; createdAt?: Date; updatedAt?: Date };
type LeanCountry = Country & { _id: Types.ObjectId };
type LeanProvince = Province & { _id: Types.ObjectId };

/**
 * Caches the in-flight bootstrap so concurrent requests cannot both generate a
 * world. The unique `slug` index is the second line of defence.
 */
let worldPromise: Promise<LeanWorld> | null = null;

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: number }).code === 11000
  );
}

async function findExistingWorld(): Promise<LeanWorld | null> {
  const world = await WorldModel.findOne({ slug: DEFAULT_WORLD_SLUG }).lean();
  return (world as unknown as LeanWorld | null) ?? null;
}

async function persistGeneratedWorld(worldId: Types.ObjectId, plan: GeneratedWorld): Promise<void> {
  const inserted = await CountryModel.insertMany(
    plan.countries.map((country) => ({
      worldId,
      name: country.name,
      shortCode: country.shortCode,
      flag: country.flag,
      capital: country.capital,
      continent: country.continent,
      description: country.description,
      colour: country.colour,
      population: country.population,
      gdp: country.gdp,
      governmentType: country.governmentType,
      leader: country.leader,
      stability: country.stability,
      geometry: country.geometry,
      centroid: country.centroid,
      area: country.area,
      resources: country.resources,
      economy: country.economy,
      military: country.military,
      diplomacy: country.diplomacy,
      government: country.government,
      history: country.history,
    })),
    { ordered: true },
  );

  // insertMany preserves input order, so index alignment maps provinces to countries.
  const provinces = generateProvinceDocuments(worldId, plan, inserted.map((doc) => doc._id));

  if (provinces.length > 0) {
    await ProvinceModel.insertMany(provinces, { ordered: true });
  }
}

function generateProvinceDocuments(
  worldId: Types.ObjectId,
  plan: GeneratedWorld,
  countryIds: Types.ObjectId[],
): Array<Record<string, unknown>> {
  return plan.countries.flatMap((country, index) => {
    const countryId = countryIds[index];

    if (!countryId) return [];

    return country.provinces.map((province) => ({
      worldId,
      countryId,
      name: province.name,
      geometry: province.geometry,
      centroid: province.centroid,
      population: province.population,
      resources: province.resources,
      terrain: province.terrain,
      infrastructure: province.infrastructure,
      currentOwner: province.currentOwner,
      currentController: province.currentController,
      area: province.area,
    }));
  });
}

async function initialiseWorld(): Promise<LeanWorld> {
  const existing = await findExistingWorld();

  if (existing) return existing;

  const plan = generateWorld(DEFAULT_WORLD_SEED);

  let world: LeanWorld;

  try {
    world = (await WorldModel.create({
      name: plan.name,
      slug: DEFAULT_WORLD_SLUG,
      description: plan.description,
      seed: plan.seed,
      currentSimulationDate: new Date(plan.currentSimulationDate),
      mapConfig: plan.mapConfig,
      countryCount: plan.countryCount,
      continentCount: plan.continentCount,
      simulationSettings: plan.simulationSettings,
    })) as unknown as LeanWorld;
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;

    const raced = await findExistingWorld();

    if (!raced) throw error;

    return raced;
  }

  await persistGeneratedWorld(world._id, plan);

  return world;
}

/**
 * Idempotent: the default world is generated exactly once per database, then
 * existing countries are topped up with the profile records they are missing.
 */
export async function ensureDefaultWorld(): Promise<LeanWorld> {
  worldPromise ??= initialiseWorld()
    .then(async (world) => {
      await backfillCountryProfiles(world._id);
      return world;
    })
    .catch((error: unknown) => {
      worldPromise = null;
      throw error;
    });

  return worldPromise;
}

/** Test helper: forgets the cached bootstrap promise. */
export function resetWorldCache(): void {
  worldPromise = null;
}

function toWorldSummary(world: LeanWorld, provinceCount: number): WorldSummary {
  return {
    id: String(world._id),
    name: world.name,
    slug: world.slug,
    description: world.description ?? '',
    seed: world.seed,
    createdAt: new Date(world.createdAt ?? Date.now()).toISOString(),
    updatedAt: new Date(world.updatedAt ?? Date.now()).toISOString(),
    currentDate: new Date(world.currentSimulationDate).toISOString(),
    mapConfig: {
      center: (world.mapConfig?.center ?? [0, 6]) as number[],
      zoom: world.mapConfig?.zoom ?? 1.55,
      minZoom: world.mapConfig?.minZoom ?? 1,
      maxZoom: world.mapConfig?.maxZoom ?? 9,
      projection: world.mapConfig?.projection ?? 'mercator',
      oceanColor: world.mapConfig?.oceanColor ?? '#070b11',
      landOpacity: world.mapConfig?.landOpacity ?? 0.62,
    },
    simulationSettings: {
      speed: world.simulationSettings?.speed ?? 'paused',
      difficulty: world.simulationSettings?.difficulty ?? 'standard',
      startYear: world.simulationSettings?.startYear ?? 2031,
      autoAdvance: world.simulationSettings?.autoAdvance ?? false,
    },
    stats: {
      countryCount: world.countryCount,
      continentCount: world.continentCount,
      provinceCount,
    },
  };
}

function toCountryFeatures(country: LeanCountry, provinceCount: number) {
  const properties: CountryFeatureProperties = {
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
    provinceCount,
    centroid: (country.centroid ?? [0, 0]) as Position,
  };

  return {
    type: 'Feature' as const,
    id: String(country._id),
    properties,
    geometry: country.geometry as unknown as Geometry,
  };
}

/** Everything the map needs in one round trip: world metadata plus country features. */
export async function getWorldMap(): Promise<WorldMapPayload> {
  const world = await ensureDefaultWorld();

  const countries = (await CountryModel.find({ worldId: world._id })
    .sort({ name: 1 })
    .lean()) as unknown as LeanCountry[];

  const provinceCounts = await ProvinceModel.aggregate<{ _id: Types.ObjectId; count: number }>([
    { $match: { worldId: world._id } },
    { $group: { _id: '$countryId', count: { $sum: 1 } } },
  ]);

  const countsByCountry = new Map(provinceCounts.map((entry) => [String(entry._id), entry.count]));
  const provinceTotal = provinceCounts.reduce((sum, entry) => sum + entry.count, 0);

  return {
    world: toWorldSummary(world, provinceTotal),
    countries: {
      type: 'FeatureCollection',
      features: countries.map((country) =>
        toCountryFeatures(country, countsByCountry.get(String(country._id)) ?? 0),
      ),
    },
  };
}

/** Province boundaries, requested once the camera is close enough to draw them. */
export async function getProvinceFeatures(
  countryId?: string,
): Promise<FeatureCollection<ProvinceFeatureProperties>> {
  const world = await ensureDefaultWorld();

  const filter: Record<string, unknown> = { worldId: world._id };

  if (countryId) {
    if (!Types.ObjectId.isValid(countryId)) {
      throw AppError.badRequest('countryId must be a valid identifier');
    }

    filter.countryId = new Types.ObjectId(countryId);
  }

  const provinces = (await ProvinceModel.find(filter).lean()) as unknown as LeanProvince[];

  return {
    type: 'FeatureCollection',
    features: provinces.map((province) => ({
      type: 'Feature',
      id: String(province._id),
      properties: {
        id: String(province._id),
        name: province.name,
        countryId: String(province.countryId),
        population: province.population,
        terrain: province.terrain,
        resources: province.resources ?? [],
        infrastructure: province.infrastructure,
        currentOwner: province.currentOwner,
        currentController: province.currentController,
        centroid: (province.centroid ?? [0, 0]) as Position,
      },
      geometry: province.geometry as unknown as Geometry,
    })),
  };
}

/*
 * The dossier payload lives in country.service (getCountryProfile plus
 * getCountryProvinces), so this module only serves the map itself.
 */
