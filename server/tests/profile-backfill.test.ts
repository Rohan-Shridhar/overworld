import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  countryFind: vi.fn(),
  countryUpdateOne: vi.fn(),
  provinceFind: vi.fn(),
  provinceBulkWrite: vi.fn(),
}));

vi.mock('../src/models/country.model.js', () => ({
  CountryModel: { find: mocks.countryFind, updateOne: mocks.countryUpdateOne },
}));

vi.mock('../src/models/province.model.js', () => ({
  ProvinceModel: { find: mocks.provinceFind, bulkWrite: mocks.provinceBulkWrite },
}));

const { backfillCountryProfiles } = await import('../src/world/profile-backfill.js');

const worldId = new Types.ObjectId();
const bareId = new Types.ObjectId();
const completeId = new Types.ObjectId();

const bareCountry = {
  _id: bareId,
  name: 'Aurelia',
  shortCode: 'AUR',
  capital: 'Aurholm',
  continent: 'Vesperia',
  population: 12_000_000,
  governmentType: 'Federal Republic',
  resources: ['grain'],
};

const completeCountry = {
  _id: completeId,
  name: 'Kethara',
  shortCode: 'KET',
  capital: 'Kelgrad',
  continent: 'Vesperia',
  population: 9_000_000,
  governmentType: 'Constitutional Monarchy',
  resources: ['iron'],
  description: 'An industrial monarchy on the northern coast.',
  area: 21.5,
  economy: { gdpGrowth: 1.8, inflation: 3, debt: 40, currency: 'Eldmark', tradeBalance: 4 },
  military: { personnel: 31_000 },
  government: { ideology: 'Social conservatism' },
  diplomacy: { status: 'Friendly', alliances: ['Aurelia'], treaties: [], rivals: [], sanctions: [], tradePartners: ['Aurelia'] },
  history: [{ at: new Date('2031-01-01T00:00:00.000Z'), title: 'State founded', kind: 'foundation' }],
};

const square = {
  type: 'Polygon',
  coordinates: [
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0, 0],
    ],
  ],
};

function stubProvinces(rows: Array<Record<string, unknown>>) {
  mocks.provinceFind.mockReturnValue({ select: () => ({ lean: async () => rows }) });
}

describe('backfillCountryProfiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.countryFind.mockReturnValue({ lean: async () => [bareCountry, completeCountry] });
    mocks.countryUpdateOne.mockResolvedValue({ acknowledged: true });
    mocks.provinceBulkWrite.mockResolvedValue({ modifiedCount: 0 });
    stubProvinces([
      { _id: new Types.ObjectId(), countryId: bareId, name: 'Velmora', area: 3.4 },
      { _id: new Types.ObjectId(), countryId: bareId, name: 'Ostrava', area: 2.6 },
    ]);
  });

  it('fills the profile records a country is missing', async () => {
    const updated = await backfillCountryProfiles(worldId);

    expect(updated).toBe(1);
    expect(mocks.countryUpdateOne).toHaveBeenCalledTimes(1);

    const [filter, update] = mocks.countryUpdateOne.mock.calls[0] as [
      { _id: Types.ObjectId },
      { $set: Record<string, unknown> },
    ];
    const set = update.$set;

    expect(String(filter._id)).toBe(String(bareId));
    expect((set.economy as { gdpGrowth: number }).gdpGrowth).toBeTypeOf('number');
    expect((set.military as { personnel: number }).personnel).toBeGreaterThan(0);
    expect((set.military as { bases: Array<{ province: string }> }).bases[0]?.province).toBe(
      'Velmora',
    );
    expect(set.area).toBeCloseTo(6, 2);
    expect(set.description).toContain('Aurelia');
    expect((set.history as unknown[]).length).toBe(2);
    expect(set.diplomacy).toBeDefined();
    expect(set.government).toBeDefined();
  });

  it('leaves a fully recorded country untouched', async () => {
    await backfillCountryProfiles(worldId);

    const updatedIds = mocks.countryUpdateOne.mock.calls.map((call) =>
      String((call[0] as { _id: Types.ObjectId })._id),
    );

    expect(updatedIds).not.toContain(String(completeId));
  });

  it('derives province areas from geometry when they are missing', async () => {
    stubProvinces([{ _id: new Types.ObjectId(), countryId: bareId, name: 'Velmora', geometry: square }]);

    await backfillCountryProfiles(worldId);

    expect(mocks.provinceBulkWrite).toHaveBeenCalledTimes(1);

    const writes = mocks.provinceBulkWrite.mock.calls[0]?.[0] as Array<{
      updateOne: { update: { $set: { area: number } } };
    }>;

    expect(writes[0]?.updateOne.update.$set.area).toBeGreaterThan(0);
  });
});
