import {
  DEFAULT_WORLD_NAME,
  DEFAULT_WORLD_SEED,
  MAP_DEFAULT_ZOOM,
  WORLD_DESCRIPTION,
  SIMULATION_START_DATE,
} from '../world.constants.js';
import {
  CONTINENTS,
  FLAGS,
  GOVERNMENT_TYPES,
  RESOURCES,
  TERRAINS,
  buildCapitalName,
  buildCountryName,
  buildLeaderName,
  buildShortCode,
  colourForIndex,
} from './content.js';
import {
  clipRingToGeometry,
  createRadialRing,
  geometryArea,
  polygonBounds,
  polygonCentroid,
  samplePointsInRing,
  voronoiCells,
  type Geometry,
  type Position,
} from './geometry.js';
import {
  buildDiplomacy,
  buildEconomy,
  buildGovernance,
  buildMilitary,
  type CountryDiplomacy,
  type CountryEconomy,
  type CountryGovernance,
  type CountryMilitary,
} from './profile.js';
import { createRandom, type SeededRandom } from './seeded-random.js';

export interface GeneratedProvince {
  name: string;
  geometry: Geometry;
  centroid: Position;
  population: number;
  resources: string[];
  terrain: string;
  infrastructure: number;
  currentOwner: string;
  currentController: string;
  area: number;
}

export interface GeneratedCountry {
  name: string;
  shortCode: string;
  flag: string;
  capital: string;
  continent: string;
  description: string;
  colour: string;
  population: number;
  gdp: number;
  governmentType: string;
  leader: string;
  stability: number;
  geometry: Geometry;
  centroid: Position;
  area: number;
  resources: string[];
  economy: CountryEconomy;
  military: CountryMilitary;
  diplomacy: CountryDiplomacy;
  government: CountryGovernance;
  history: Array<{ at: Date; title: string; detail: string; kind: string }>;
  provinces: GeneratedProvince[];
}

export interface GeneratedWorld {
  name: string;
  description: string;
  seed: string;
  currentSimulationDate: string;
  mapConfig: {
    center: Position;
    zoom: number;
    minZoom: number;
    maxZoom: number;
    projection: string;
    oceanColor: string;
    landOpacity: number;
  };
  countryCount: number;
  continentCount: number;
  simulationSettings: {
    speed: string;
    difficulty: string;
    startYear: number;
    autoAdvance: boolean;
  };
  countries: GeneratedCountry[];
}

function uniqueName(used: Set<string>, random: SeededRandom): string {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const candidate = buildCountryName(random);

    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }

  const fallback = `Marchland ${used.size + 1}`;
  used.add(fallback);
  return fallback;
}

function uniqueCode(name: string, used: Set<string>): string {
  const base = buildShortCode(name);
  let candidate = base;
  let attempt = 0;

  while (used.has(candidate) && attempt < 40) {
    attempt += 1;
    candidate = `${base.slice(0, 2)}${String.fromCharCode(65 + ((used.size + attempt) % 26))}`;
  }

  used.add(candidate);
  return candidate;
}

function uniqueCapital(used: Set<string>, random: SeededRandom): string {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const candidate = buildCapitalName(random);

    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }

  const fallback = `Capital ${used.size + 1}`;
  used.add(fallback);
  return fallback;
}

function pickResources(random: SeededRandom): string[] {
  const count = random.int(1, 3);
  const picked = new Set<string>();
  let attempts = 0;

  while (picked.size < count && attempts < 24) {
    attempts += 1;
    picked.add(random.pick(RESOURCES));
  }

  return [...picked];
}

function generateProvinces(
  countryName: string,
  geometry: Geometry,
  random: SeededRandom,
  usedNames: Set<string>,
): GeneratedProvince[] {
  const outerRing = geometry.type === 'Polygon' ? geometry.coordinates[0] : geometry.coordinates[0]?.[0];

  if (!outerRing) return [];

  const bounds = polygonBounds(geometry);
  const span = Math.min(bounds[2] - bounds[0], bounds[3] - bounds[1]);
  const target = random.int(3, 5);

  const sampled = samplePointsInRing(outerRing, target, random, span * 0.3);
  const seeds = sampled.length >= 2 ? sampled : samplePointsInRing(outerRing, target, random, 0);
  const cells = voronoiCells(seeds, bounds);
  const provinces: GeneratedProvince[] = [];

  cells.forEach((cell) => {
    const provinceGeometry = clipRingToGeometry(cell, geometry);

    if (!provinceGeometry) return;

    provinces.push({
      name: uniqueName(usedNames, random),
      geometry: provinceGeometry,
      centroid: polygonCentroid(provinceGeometry),
      population: random.int(48_000, 3_400_000),
      resources: pickResources(random),
      terrain: random.pick(TERRAINS),
      infrastructure: random.int(18, 94),
      currentOwner: countryName,
      currentController: countryName,
      area: Math.round(geometryArea(provinceGeometry) * 1000) / 1000,
    });
  });

  return provinces;
}

/**
 * Continent outlines only — used when an administrator creates a country and needs
 * to know which land the new state may occupy.
 */
export function buildContinentRings(seed: string): Array<{ name: string; geometry: Geometry }> {
  const random = createRandom(`${seed}:continents`);

  return CONTINENTS.map((continent) => ({
    name: continent.name,
    geometry: {
      type: 'Polygon' as const,
      coordinates: [
        createRadialRing(
          continent.center,
          continent.radius[0],
          continent.radius[1],
          22,
          random,
          0.34,
        ),
      ],
    },
  }));
}

/**
 * Builds a complete fictional world from a seed.
 *
 * Pure function: the same seed always produces byte-identical geography and
 * attributes, which is what makes generation safe to retry and easy to test.
 */
export function generateWorld(seed: string = DEFAULT_WORLD_SEED): GeneratedWorld {
  const random = createRandom(seed);
  const usedCountryNames = new Set<string>();
  const usedProvinceNames = new Set<string>();
  const usedCodes = new Set<string>();
  const usedCapitals = new Set<string>();

  const countries: GeneratedCountry[] = [];
  let colourIndex = 0;

  for (const continent of CONTINENTS) {
    const continentRing = createRadialRing(
      continent.center,
      continent.radius[0],
      continent.radius[1],
      22,
      random,
      0.34,
    );
    const continentGeometry: Geometry = { type: 'Polygon', coordinates: [continentRing] };
    const bounds = polygonBounds(continentGeometry);
    const spacing = Math.min(continent.radius[0], continent.radius[1]) * 0.34;

    const sampled = samplePointsInRing(continentRing, continent.countries, random, spacing);
    const seeds =
      sampled.length === continent.countries
        ? sampled
        : samplePointsInRing(continentRing, continent.countries, random, 0);
    const cells = voronoiCells(seeds, bounds);

    cells.forEach((cell) => {
      const geometry = clipRingToGeometry(cell, continentGeometry);

      if (!geometry) return;

      const name = uniqueName(usedCountryNames, random);
      const population = random.int(1_400_000, 86_000_000);
      const gdpPerCapita = random.int(1_900, 62_000);
      const capital = uniqueCapital(usedCapitals, random);
      const governmentType = random.pick(GOVERNMENT_TYPES);
      const provinces = generateProvinces(name, geometry, random, usedProvinceNames);
      const terrains = [...new Set(provinces.map((province) => province.terrain))].slice(0, 2);
      const resources = [...new Set(provinces.flatMap((province) => province.resources))];

      countries.push({
        name,
        shortCode: uniqueCode(name, usedCodes),
        flag: random.pick(FLAGS),
        capital,
        continent: continent.name,
        description: `${name} is a ${governmentType.toLowerCase()} of ${provinces.length} provinces on ${continent.name}, governed from ${capital}. Its territory runs through ${terrains.join(' and ')}.`,
        colour: colourForIndex(colourIndex),
        population,
        gdp: Math.round((population * gdpPerCapita) / 1_000_000_000),
        governmentType,
        leader: buildLeaderName(random),
        stability: random.int(26, 94),
        geometry,
        centroid: polygonCentroid(geometry),
        area: Math.round(provinces.reduce((sum, province) => sum + province.area, 0) * 100) / 100,
        resources,
        economy: buildEconomy(random, resources),
        military: buildMilitary(random, population, provinces.map((province) => province.name)),
        diplomacy: {
          status: 'Neutral',
          alliances: [],
          treaties: [],
          rivals: [],
          sanctions: [],
          tradePartners: [],
        },
        government: buildGovernance(random, governmentType, 2031),
        history: [
          {
            at: new Date(Date.UTC(2031, 0, 1)),
            title: 'State founded',
            detail: `${name} enters the world record with ${provinces.length} provinces.`,
            kind: 'foundation',
          },
        ],
        provinces,
      });

      colourIndex += 1;
    });
  }

  // Diplomacy is a second pass: every reference must point at a country that exists.
  countries.forEach((country) => {
    const otherNames = countries
      .filter((other) => country.shortCode !== other.shortCode)
      .map((other) => other.name);

    country.diplomacy = buildDiplomacy(random, otherNames);
  });

  return {
    name: DEFAULT_WORLD_NAME,
    description: WORLD_DESCRIPTION,
    seed,
    currentSimulationDate: SIMULATION_START_DATE,
    mapConfig: {
      center: [0, 6],
      zoom: MAP_DEFAULT_ZOOM,
      minZoom: 1,
      maxZoom: 9,
      projection: 'mercator',
      oceanColor: '#070b11',
      landOpacity: 0.62,
    },
    countryCount: countries.length,
    continentCount: CONTINENTS.length,
    simulationSettings: {
      speed: 'paused',
      difficulty: 'standard',
      startYear: 2031,
      autoAdvance: false,
    },
    countries,
  };
}
