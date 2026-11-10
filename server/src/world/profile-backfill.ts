import type { Types } from 'mongoose';
import { CountryModel, type Country } from '../models/country.model.js';
import { ProvinceModel } from '../models/province.model.js';
import { geometryArea, type Geometry } from './generator/geometry.js';
import {
  buildDiplomacy,
  buildEconomy,
  buildGovernance,
  buildMilitary,
} from './generator/profile.js';
import { createRandom } from './generator/seeded-random.js';
import { DEFAULT_WORLD_SEED } from './world.constants.js';

type LeanCountry = Country & { _id: Types.ObjectId };

interface ProvinceRef {
  _id: Types.ObjectId;
  countryId: Types.ObjectId;
  name: string;
  area?: number;
  geometry?: unknown;
}

const START_YEAR = 2031;

function hasProfileValues(country: LeanCountry): boolean {
  const { diplomacy } = country;
  const diplomacyEmpty =
    (diplomacy?.tradePartners?.length ?? 0) === 0 &&
    (diplomacy?.treaties?.length ?? 0) === 0 &&
    (diplomacy?.alliances?.length ?? 0) === 0;

  return (
    country.economy?.gdpGrowth != null &&
    country.military?.personnel != null &&
    Boolean(country.government?.ideology) &&
    Boolean(country.description) &&
    (country.history?.length ?? 0) > 0 &&
    Boolean(country.area) &&
    !diplomacyEmpty
  );
}

function resolvedArea(province: ProvinceRef): number {
  if (province.area) return province.area;
  if (!province.geometry) return 0;

  return Math.round(geometryArea(province.geometry as Geometry) * 1000) / 1000;
}

/**
 * Worlds generated before the country profile existed carry empty economy,
 * military, diplomacy, history and area records, so every dossier tab reads
 * zero. This fills only what is absent, using the same deterministic
 * generators as the world builder, and never overwrites an administered value.
 */
export async function backfillCountryProfiles(worldId: Types.ObjectId): Promise<number> {
  const countries = (await CountryModel.find({ worldId }).lean()) as unknown as LeanCountry[];

  if (countries.length === 0) return 0;

  const provinces = (await ProvinceModel.find({ worldId })
    .select('countryId name area geometry')
    .lean()) as unknown as ProvinceRef[];

  const provincesByCountry = new Map<string, ProvinceRef[]>();

  provinces.forEach((province) => {
    const key = String(province.countryId);
    const list = provincesByCountry.get(key) ?? [];
    list.push(province);
    provincesByCountry.set(key, list);
  });

  const areaWrites = provinces
    .filter((province) => !province.area && province.geometry)
    .map((province) => ({
      updateOne: {
        filter: { _id: province._id },
        update: { $set: { area: resolvedArea(province) } },
      },
    }));

  if (areaWrites.length > 0) {
    await ProvinceModel.bulkWrite(areaWrites, { ordered: false });
  }

  const countryNames = countries.map((country) => country.name);
  let updated = 0;

  for (const country of countries) {
    const own = provincesByCountry.get(String(country._id)) ?? [];
    const measuredArea = Math.round(
      own.reduce((total, province) => total + resolvedArea(province), 0) * 100,
    ) / 100;

    const needsArea = !country.area || areaWrites.length > 0;

    if (hasProfileValues(country) && !needsArea) continue;

    const provinceNames = own.map((province) => province.name);
    const resources = country.resources?.length ? country.resources : ['grain'];
    const random = createRandom(`backfill:${DEFAULT_WORLD_SEED}:${country.shortCode}`);
    const changes: Record<string, unknown> = {};

    if (country.economy?.gdpGrowth == null) {
      changes.economy = buildEconomy(random, resources);
    }

    if (country.military?.personnel == null) {
      changes.military = buildMilitary(random, country.population, provinceNames);
    }

    if (
      (country.diplomacy?.tradePartners?.length ?? 0) === 0 &&
      (country.diplomacy?.treaties?.length ?? 0) === 0 &&
      (country.diplomacy?.alliances?.length ?? 0) === 0
    ) {
      changes.diplomacy = buildDiplomacy(
        random,
        countryNames.filter((name) => name !== country.name),
      );
    }

    if (!country.government?.ideology) {
      changes.government = buildGovernance(random, country.governmentType, START_YEAR);
    }

    if (needsArea) {
      changes.area = measuredArea;
    }

    if (!country.description) {
      changes.description = `${country.name} is a ${country.governmentType.toLowerCase()} on ${country.continent}, governed from ${country.capital}. ${own.length} provinces report to the capital.`;
    }

    if ((country.history?.length ?? 0) === 0) {
      changes.history = [
        {
          at: new Date(Date.UTC(START_YEAR, 0, 1)),
          title: 'State founded',
          detail: `${country.name} enters the world record with ${own.length} provinces.`,
          kind: 'foundation',
        },
        {
          at: new Date(Date.UTC(START_YEAR, 2, 4)),
          title: 'Profile recorded',
          detail: 'Economy, military and government figures entered the world register.',
          kind: 'administration',
        },
      ];
    }

    await CountryModel.updateOne({ _id: country._id }, { $set: changes });
    updated += 1;
  }

  return updated;
}
