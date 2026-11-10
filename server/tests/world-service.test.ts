import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  worldFindOne: vi.fn(),
  worldCreate: vi.fn(),
  countryInsertMany: vi.fn(),
  provinceInsertMany: vi.fn(),
  countryFind: vi.fn(),
  provinceAggregate: vi.fn(),
}));

vi.mock('../src/models/world.model.js', () => ({
  WorldModel: { findOne: mocks.worldFindOne, create: mocks.worldCreate },
}));

vi.mock('../src/models/country.model.js', () => ({
  CountryModel: { insertMany: mocks.countryInsertMany, find: mocks.countryFind },
}));

vi.mock('../src/models/province.model.js', () => ({
  ProvinceModel: { insertMany: mocks.provinceInsertMany, aggregate: mocks.provinceAggregate },
}));

const { ensureDefaultWorld, resetWorldCache } = await import('../src/world/world.service.js');

const worldId = new Types.ObjectId();

const leanWorld = () => ({
  _id: worldId,
  name: 'Overworld',
  slug: 'overworld',
  description: 'A fictional world',
  seed: 'seed',
  currentSimulationDate: new Date('2031-01-01T00:00:00.000Z'),
  mapSettings: {},
  mapConfig: { minLat: -60, maxLat: 75, minLon: -170, maxLon: 170, initialZoom: 2.2 },
  countryCount: 30,
  continentCount: 6,
  simulationMeta: {},
  simulationSettings: { tickHours: 24, speed: 'paused', difficulty: 'standard', startYear: 2031, autoAdvance: false },
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe('world persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetWorldCache();

    mocks.worldFindOne.mockReturnValue({ lean: async () => null });
    mocks.worldCreate.mockImplementation(async (document: Record<string, unknown>) => ({
      ...document,
      _id: worldId,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    mocks.countryInsertMany.mockImplementation(
      async (documents: Array<Record<string, unknown>>) =>
        documents.map((document) => ({ ...document, _id: new Types.ObjectId() })),
    );
    mocks.provinceInsertMany.mockImplementation(
      async (documents: Array<Record<string, unknown>>) => documents,
    );
  });

  it('creates the world, its countries and its provinces exactly once', async () => {
    const [first, second] = await Promise.all([ensureDefaultWorld(), ensureDefaultWorld()]);

    expect(first).toBe(second);
    expect(mocks.worldCreate).toHaveBeenCalledTimes(1);
    expect(mocks.countryInsertMany).toHaveBeenCalledTimes(1);
    expect(mocks.provinceInsertMany).toHaveBeenCalledTimes(1);
  });

  it('persists thirty countries and links every province to a persisted country', async () => {
    await ensureDefaultWorld();

    const countryDocuments = mocks.countryInsertMany.mock.calls[0]?.[0] as Array<Record<string, unknown>>;
    const provinceDocuments = mocks.provinceInsertMany.mock.calls[0]?.[0] as Array<Record<string, unknown>>;
    const insertedCountries = await mocks.countryInsertMany.mock.results[0]?.value;
    const countryIds = new Set(insertedCountries.map((country: { _id: Types.ObjectId }) => String(country._id)));

    expect(countryDocuments).toHaveLength(30);
    expect(provinceDocuments.length).toBeGreaterThanOrEqual(90);
    expect(new Set(provinceDocuments.map((province) => String(province.countryId))).size).toBe(30);

    provinceDocuments.forEach((province) => {
      expect(countryIds.has(String(province.countryId))).toBe(true);
      expect(String(province.worldId)).toBe(String(worldId));
      expect(province.geometry).toBeDefined();
    });
  });

  it('reuses an existing world instead of generating a duplicate', async () => {
    mocks.worldFindOne.mockReturnValue({ lean: async () => leanWorld() });

    await ensureDefaultWorld();
    await ensureDefaultWorld();

    expect(mocks.worldCreate).not.toHaveBeenCalled();
    expect(mocks.countryInsertMany).not.toHaveBeenCalled();
  });

  it('recovers when a concurrent request wins the unique slug', async () => {
    mocks.worldCreate.mockRejectedValueOnce(Object.assign(new Error('duplicate'), { code: 11000 }));
    mocks.worldFindOne
      .mockReturnValueOnce({ lean: async () => null })
      .mockReturnValue({ lean: async () => leanWorld() });

    const world = await ensureDefaultWorld();

    expect(world._id).toEqual(worldId);
    // The losing request must not write countries again.
    expect(mocks.countryInsertMany).not.toHaveBeenCalled();
  });
});
