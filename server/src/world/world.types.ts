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
    speed: string;
    difficulty: string;
    startYear: number;
    autoAdvance: boolean;
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
