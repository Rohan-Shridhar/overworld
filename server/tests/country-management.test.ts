import request from 'supertest';
import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const WORLD_ID = new Types.ObjectId();
const COUNTRY_ID = new Types.ObjectId();
const OTHER_ID = new Types.ObjectId();
const PROVINCE_ID = new Types.ObjectId();

const mocks = vi.hoisted(() => ({
  countryFind: vi.fn(),
  countryFindOne: vi.fn(),
  countryCreate: vi.fn(),
  countryFindOneAndUpdate: vi.fn(),
  countryUpdateOne: vi.fn(),
  countryDeleteOne: vi.fn(),
  countryCount: vi.fn(),
  provinceFind: vi.fn(),
  provinceCreate: vi.fn(),
  provinceUpdateMany: vi.fn(),
  provinceUpdateOne: vi.fn(),
  provinceDeleteMany: vi.fn(),
  provinceFindById: vi.fn(),
  provinceFindByIdAndUpdate: vi.fn(),
}));

vi.mock('../src/models/country.model.js', () => ({
  CountryModel: {
    find: mocks.countryFind,
    findOne: mocks.countryFindOne,
    create: mocks.countryCreate,
    findOneAndUpdate: mocks.countryFindOneAndUpdate,
    updateOne: mocks.countryUpdateOne,
    deleteOne: mocks.countryDeleteOne,
    countDocuments: mocks.countryCount,
  },
}));

vi.mock('../src/models/province.model.js', () => ({
  ProvinceModel: {
    find: mocks.provinceFind,
    create: mocks.provinceCreate,
    updateMany: mocks.provinceUpdateMany,
    updateOne: mocks.provinceUpdateOne,
    deleteMany: mocks.provinceDeleteMany,
    findById: mocks.provinceFindById,
    findByIdAndUpdate: mocks.provinceFindByIdAndUpdate,
  },
}));

vi.mock('../src/world/world.service.js', () => ({
  ensureDefaultWorld: vi.fn(async () => ({ _id: WORLD_ID, slug: 'overworld' })),
  getWorldMap: vi.fn(),
  getProvinceFeatures: vi.fn(),
  resetWorldCache: vi.fn(),
}));

const service = await import('../src/world/country.service.js');
const { createApp } = await import('../src/app.js');

const app = createApp();

const COUNTRY_DOC = {
  _id: COUNTRY_ID,
  worldId: WORLD_ID,
  name: 'Testland',
  shortCode: 'TES',
  flag: '🏳️',
  capital: 'Testholm',
  continent: 'Aurelia',
  description: '',
  colour: '#445566',
  population: 5_000_000,
  gdp: 120,
  governmentType: 'Federal Republic',
  leader: 'Ada Vasko',
  stability: 66,
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [-100, 30],
        [-98, 30],
        [-98, 32],
        [-100, 32],
        [-100, 30],
      ],
    ],
  },
  centroid: [-99, 31],
  area: 0,
  resources: ['grain'],
  economy: { gdpGrowth: 2, inflation: 3, debt: 40, currency: 'Aurel', tradeBalance: 4, resourceProduction: [] },
  military: { personnel: 1000, army: 600, navy: 200, airForce: 200, equipment: { tanks: 4, aircraft: 2, ships: 1, artillery: 6 }, bases: [], deployments: [] },
  diplomacy: { status: 'Neutral', alliances: [], treaties: [], rivals: [], sanctions: [], tradePartners: [] },
  government: { environment: 'Stable', ideology: 'Civic republicanism', rulingParty: 'Civic Union', nextElection: null },
  history: [{ at: new Date(), title: 'State founded', detail: '', kind: 'foundation' }],
  isAdminEdited: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const CREATE_BODY = {
  name: 'Testland',
  flag: '🏳️',
  capital: 'Testholm',
  colour: '#445566',
  continent: 'Aurelia',
  population: 5_000_000,
  gdp: 120,
  governmentType: 'Federal Republic',
  leader: 'Ada Vasko',
  stability: 66,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.countryFind.mockReturnValue({ lean: async () => [] });
  mocks.countryFindOne.mockReturnValue({ lean: async () => null });
  mocks.countryCreate.mockImplementation(async (document: Record<string, unknown>) => ({
    ...document,
    _id: COUNTRY_ID,
  }));
  mocks.countryFindOneAndUpdate.mockReturnValue({ lean: async () => ({ ...COUNTRY_DOC, population: 7_500_000 }) });
  mocks.countryUpdateOne.mockResolvedValue({ acknowledged: true });
  mocks.countryDeleteOne.mockResolvedValue({ deletedCount: 1 });
  mocks.countryCount.mockResolvedValue(12);
  mocks.provinceFind.mockReturnValue({ lean: async () => [{ area: 12.5 }, { area: 7.25 }] });
  mocks.provinceDeleteMany.mockResolvedValue({ deletedCount: 4 });
  mocks.provinceCreate.mockImplementation(async (document: Record<string, unknown>) => ({
    ...document,
    _id: PROVINCE_ID,
  }));
  mocks.provinceUpdateMany.mockResolvedValue({ acknowledged: true });
  mocks.provinceUpdateOne.mockResolvedValue({ acknowledged: true });
  mocks.provinceFindByIdAndUpdate.mockReturnValue({ lean: async () => ({ ...COUNTRY_DOC, _id: PROVINCE_ID, name: 'Velmora' }) });
});

describe('country creation', () => {
  it('claims territory in the requested continent and records the admission', async () => {
    const profile = await service.createCountry({ ...CREATE_BODY, resources: ['grain', 'timber'] });

    expect(mocks.countryCreate).toHaveBeenCalledTimes(1);

    const document = mocks.countryCreate.mock.calls[0]?.[0] as Record<string, unknown>;

    expect(document.continent).toBe('Aurelia');
    expect(document.shortCode).toBe('TES');
    expect(document.isAdminEdited).toBe(true);
    expect((document.history as Array<{ kind: string }>)[0]?.kind).toBe('foundation');
    expect(profile.code).toBe('TES');
    expect(profile.provinceCount).toBe(0);
  });

  it('rejects a continent that does not exist in the world', async () => {
    await expect(
      service.createCountry({ ...CREATE_BODY, continent: 'Atlantis' }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('country editing', () => {
  it('persists the changed statistics, marks the country edited and appends history', async () => {
    mocks.countryFindOne.mockReturnValue({ lean: async () => COUNTRY_DOC });

    await service.updateCountry('TES', {
      population: 7_500_000,
      economy: { inflation: 6.4 },
      military: { personnel: 12_000 },
    });

    const update = mocks.countryFindOneAndUpdate.mock.calls[0]?.[1] as {
      $set: Record<string, unknown>;
      $push: { history: { title: string } };
    };

    expect(update.$set.population).toBe(7_500_000);
    expect(update.$set['economy.inflation']).toBe(6.4);
    expect(update.$set['military.personnel']).toBe(12_000);
    expect(update.$set.isAdminEdited).toBe(true);
    expect(update.$push.history.title).toBe('Administrative edit');
  });

  it('refuses an update that changes no supported field', async () => {
    mocks.countryFindOne.mockReturnValue({ lean: async () => COUNTRY_DOC });

    await expect(service.updateCountry('TES', {})).rejects.toMatchObject({ statusCode: 400 });
  });

  it('renames provincial owners when the country is renamed', async () => {
    mocks.countryFindOne.mockReturnValue({ lean: async () => COUNTRY_DOC });

    await service.updateCountry('TES', { name: 'Newland' });

    expect(mocks.provinceUpdateMany).toHaveBeenCalledWith(
      { countryId: COUNTRY_ID },
      { $set: { currentOwner: 'Newland' } },
    );
  });
});

describe('country deletion', () => {
  it('removes the country together with its provinces', async () => {
    mocks.countryFindOne.mockReturnValue({ lean: async () => COUNTRY_DOC });

    const removed = await service.deleteCountry('TES');

    expect(removed).toBe(4);
    expect(mocks.provinceDeleteMany).toHaveBeenCalledWith({ countryId: COUNTRY_ID });
    expect(mocks.countryDeleteOne).toHaveBeenCalledWith({ _id: COUNTRY_ID });
  });

  it('refuses to delete the last remaining country', async () => {
    mocks.countryCount.mockResolvedValue(1);

    await expect(service.deleteCountry('TES')).rejects.toMatchObject({ statusCode: 400 });
    expect(mocks.countryDeleteOne).not.toHaveBeenCalled();
  });
});

describe('province ownership', () => {
  it('moves a province to another country and resyncs both areas', async () => {
    mocks.provinceFindById
      .mockReturnValueOnce({
        lean: async () => ({
          _id: PROVINCE_ID,
          countryId: OTHER_ID,
          name: 'Velmora',
          currentOwner: 'Testland',
          currentController: 'Testland',
          population: 400_000,
          terrain: 'coastal plain',
          resources: ['grain'],
          infrastructure: 55,
          area: 3.2,
        }),
      })
      .mockReturnValue({
        lean: async () => ({
          _id: PROVINCE_ID,
          countryId: COUNTRY_ID,
          name: 'Velmora',
          currentOwner: 'Testland',
          currentController: 'Testland',
          population: 400_000,
          terrain: 'coastal plain',
          resources: ['grain'],
          infrastructure: 55,
          area: 3.2,
        }),
      });
    mocks.countryFindOne.mockReturnValue({ lean: async () => ({ ...COUNTRY_DOC, name: 'Testland' }) });

    const result = await service.transferProvince(String(PROVINCE_ID), 'TES');

    expect(mocks.provinceUpdateOne).toHaveBeenCalledWith(
      { _id: PROVINCE_ID },
      { $set: { countryId: COUNTRY_ID, currentOwner: 'Testland', currentController: 'Testland' } },
    );
    expect(result.from).toBe('Testland');
    expect(result.to).toBe('Testland');
    // Both the gaining and the losing country have their area recomputed.
    expect(mocks.provinceFind).toHaveBeenCalledTimes(2);
    expect(mocks.countryUpdateOne).toHaveBeenCalledWith(
      { _id: COUNTRY_ID },
      { $set: { area: 19.75 } },
    );
  });

  it('refuses to transfer a province to its current owner', async () => {
    mocks.provinceFindById.mockReturnValue({
      lean: async () => ({ _id: PROVINCE_ID, countryId: COUNTRY_ID, name: 'Velmora', currentOwner: 'Testland' }),
    });
    mocks.countryFindOne.mockReturnValue({ lean: async () => ({ ...COUNTRY_DOC }) });

    await expect(
      service.transferProvince(String(PROVINCE_ID), 'TES'),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('adds a province to a country and recomputes its area', async () => {
    mocks.countryFindOne.mockReturnValue({ lean: async () => COUNTRY_DOC });

    const province = await service.createProvince('TES', {
      name: 'Velmora',
      population: 400_000,
      terrain: 'coastal plain',
      resources: ['grain'],
      infrastructure: 55,
    });

    expect(mocks.provinceCreate).toHaveBeenCalledTimes(1);
    expect(province.name).toBe('Velmora');
    expect(mocks.countryUpdateOne).toHaveBeenCalledWith(
      { _id: COUNTRY_ID },
      { $set: { area: 19.75 } },
    );
  });
});

describe('country request validation', () => {
  it('rejects an invalid colour', async () => {
    const response = await request(app)
      .post('/api/world/countries')
      .send({ ...CREATE_BODY, colour: 'blue' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects an implausible population', async () => {
    const response = await request(app)
      .post('/api/world/countries')
      .send({ ...CREATE_BODY, population: 12 });

    expect(response.status).toBe(400);
  });

  it('rejects a missing leader', async () => {
    const response = await request(app)
      .post('/api/world/countries')
      .send({ ...CREATE_BODY, leader: '' });

    expect(response.status).toBe(400);
  });

  it('rejects a stability value above 100 on edit', async () => {
    const response = await request(app)
      .patch('/api/world/countries/TES')
      .send({ stability: 140 });

    expect(response.status).toBe(400);
  });

  it('rejects a province transfer with no valid target', async () => {
    const response = await request(app)
      .post(`/api/world/provinces/${String(PROVINCE_ID)}/transfer`)
      .send({ targetCode: 'TOOLONG' });

    expect(response.status).toBe(400);
  });
});
