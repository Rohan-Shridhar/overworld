import type { EventFrequency, SimulationSpeed } from '../simulation/simulation.constants.js';
import type { Geometry, Position } from './generator/geometry.js';

export interface GeoFeature<TProperties extends object> {
  type: 'Feature';
  id: string;
  properties: TProperties;
  geometry: Geometry;
}

export interface FeatureCollection<TProperties extends object> {
  type: 'FeatureCollection';
  features: GeoFeature<TProperties>[];
}

export interface CountryFeatureProperties {
  id: string;
  code: string;
  name: string;
  capital: string;
  continent: string;
  colour: string;
  flag: string;
  population: number;
  gdp: number;
  governmentType: string;
  leader: string;
  stability: number;
  provinceCount: number;
  centroid: Position;
}

export interface ProvinceFeatureProperties {
  id: string;
  name: string;
  countryId: string;
  population: number;
  terrain: string;
  resources: string[];
  infrastructure: number;
  currentOwner: string;
  currentController: string;
  centroid: Position;
}

export interface WorldSummary {
  id: string;
  name: string;
  slug: string;
  description: string;
  seed: string;
  createdAt: string;
  updatedAt: string;
  currentDate: string;
  mapConfig: {
    center: number[];
    zoom: number;
    minZoom: number;
    maxZoom: number;
    projection: string;
    oceanColor: string;
    landOpacity: number;
  };
  simulationSettings: {
    speed: SimulationSpeed;
    paused: boolean;
    autoAdvance: boolean;
    eventFrequency: EventFrequency;
    checkpointIntervalDays: number;
    difficulty: string;
    startYear: number;
  };
  stats: {
    countryCount: number;
    continentCount: number;
    provinceCount: number;
  };
}

export interface WorldMapPayload {
  world: WorldSummary;
  countries: FeatureCollection<CountryFeatureProperties>;
}

export interface ProvinceSummary {
  id: string;
  name: string;
  population: number;
  terrain: string;
  resources: string[];
  infrastructure: number;
  currentOwner: string;
  currentController: string;
  area: number;
}

export interface CountryProfile extends CountryFeatureProperties {
  description: string;
  area: number;
  resources: string[];
  isAdminEdited: boolean;
  economy: {
    gdpGrowth: number;
    inflation: number;
    debt: number;
    currency: string;
    tradeBalance: number;
    resourceProduction: Array<{ resource: string; output: number; unit: string }>;
  };
  military: {
    personnel: number;
    army: number;
    navy: number;
    airForce: number;
    equipment: { tanks: number; aircraft: number; ships: number; artillery: number };
    bases: Array<{ name: string; province: string; branch: 'army' | 'navy' | 'air'; personnel: number }>;
    deployments: Array<{
      name: string;
      province: string;
      strength: number;
      status: 'garrison' | 'deployed' | 'exercising';
    }>;
  };
  diplomacy: {
    status: string;
    alliances: string[];
    treaties: Array<{ name: string; partner: string; signedAt: string }>;
    rivals: string[];
    sanctions: string[];
    tradePartners: string[];
  };
  government: {
    environment: string;
    ideology: string;
    rulingParty: string;
    nextElection: string | null;
  };
  history: Array<{
    at: string;
    title: string;
    detail: string;
    kind: 'foundation' | 'government' | 'territory' | 'administration';
  }>;
}

export interface CountryDetailPayload {
  country: CountryFeatureProperties & { description: string };
  provinces: Array<{
    id: string;
    name: string;
    population: number;
    terrain: string;
    resources: string[];
    infrastructure: number;
    currentOwner: string;
    currentController: string;
  }>;
}
