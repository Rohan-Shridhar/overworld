/** The world every client boots into. One row per deployment, seeded deterministically. */
export const DEFAULT_WORLD_NAME = 'Overworld';
export const DEFAULT_WORLD_SLUG = 'overworld';
export const DEFAULT_WORLD_SEED = 'overworld-veil-0113';

export const WORLD_BOUNDS = {
  minLon: -180,
  minLat: -72,
  maxLon: 180,
  maxLat: 78,
} as const;

export const MAP_DEFAULT_ZOOM = 1.55;
export const MAP_PROVINCE_ZOOM = 3.6;

/** Starting simulation clock for a generated world. */
export const SIMULATION_START_DATE = '2031-01-01T00:00:00.000Z';

export const WORLD_DESCRIPTION =
  'Six invented continents, thirty sovereign states and their provinces. Every border, capital and leader here is fictional.';
