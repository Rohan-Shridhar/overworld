import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../src/utils/app-error.js';

const mocks = vi.hoisted(() => ({
  getWorldMap: vi.fn(),
  getProvinceFeatures: vi.fn(),
  getCountryDetail: vi.fn(),
}));

vi.mock('../src/world/world.service.js', () => ({
  ensureDefaultWorld: vi.fn(),
  resetWorldCache: vi.fn(),
  getWorldMap: mocks.getWorldMap,
  getProvinceFeatures: mocks.getProvinceFeatures,
  getCountryDetail: mocks.getCountryDetail,
}));

const { createApp } = await import('../src/app.js');

const app = createApp();

const WORLD_PAYLOAD = {
  world: {
    id: 'world-1',
    name: 'Overworld',
    slug: 'overworld',
    description: 'Fictional',
    seed: 'seed',
    createdAt: '2031-01-01T00:00:00.000Z',
    updatedAt: '2031-01-01T00:00:00.000Z',
    currentDate: '2031-01-01T00:00:00.000Z',
    mapConfig: { center: [0, 6], zoom: 1.55, minZoom: 1, maxZoom: 9, projection: 'mercator', oceanColor: '#070b11', landOpacity: 0.62 },
    simulationSettings: { speed: 'paused', difficulty: 'standard', startYear: 2031, autoAdvance: false },
    stats: { countryCount: 30, continentCount: 6, provinceCount: 126 },
  },
  countries: {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        id: 'country-1',
        properties: { code: 'AUR', name: 'Aurelia', colour: '#336699' },
        geometry: { type: 'Polygon', coordinates: [] },
      },
    ],
  },
};

const EMPTY_COLLECTION = { type: 'FeatureCollection', features: [] };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getWorldMap.mockResolvedValue(WORLD_PAYLOAD);
  mocks.getProvinceFeatures.mockResolvedValue(EMPTY_COLLECTION);
  mocks.getCountryDetail.mockResolvedValue({
    country: { code: 'AUR', name: 'Aurelia' },
    provinces: [],
  });
});

describe('GET /api/world', () => {
  it('returns the world metadata and country features', async () => {
    const response = await request(app).get('/api/world');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.world.stats.countryCount).toBe(30);
    expect(response.body.data.countries.type).toBe('FeatureCollection');
    expect(response.body.data.countries.features).toHaveLength(1);
  });

  it('returns province features', async () => {
    const response = await request(app).get('/api/world/provinces');

    expect(response.status).toBe(200);
    expect(response.body.data.type).toBe('FeatureCollection');
    expect(mocks.getProvinceFeatures).toHaveBeenCalled();
  });

  it('rejects a malformed country code', async () => {
    const response = await request(app).get('/api/world/countries/TOOLONG');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(mocks.getCountryDetail).not.toHaveBeenCalled();
  });

  it('returns a country detail payload', async () => {
    const response = await request(app).get('/api/world/countries/aur');

    expect(response.status).toBe(200);
    expect(response.body.data.country.code).toBe('AUR');
    expect(mocks.getCountryDetail).toHaveBeenCalledWith('aur');
  });

  it('maps a missing country to a 404 envelope', async () => {
    mocks.getCountryDetail.mockRejectedValueOnce(AppError.notFound('No country with the code "ZZZ"'));

    const response = await request(app).get('/api/world/countries/ZZZ');

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });
});
