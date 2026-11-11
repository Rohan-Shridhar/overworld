import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const persistence = vi.hoisted(() => ({
  claimTick: vi.fn(async () => true),
  releaseTick: vi.fn(async () => undefined),
  loadCountrySnapshots: vi.fn(async (): Promise<unknown[]> => []),
  persistTick: vi.fn(async () => undefined),
  recordEvents: vi.fn(async () => []),
  saveCheckpoint: vi.fn(async () => undefined),
}));

const worldModel = vi.hoisted(() => ({
  findById: vi.fn(),
  updateOne: vi.fn(async () => ({ acknowledged: true })),
}));

vi.mock('../src/models/world.model.js', () => ({ WorldModel: worldModel }));
vi.mock('../src/simulation/simulation.persistence.js', () => persistence);
vi.mock('../src/simulation/simulation.actions.js', () => ({
  drainScheduledActions: vi.fn(async () => ({ processed: 0, notes: [] })),
  queueStabilityReviews: vi.fn(async () => 0),
}));
vi.mock('../src/diplomacy/diplomacy.maintenance.js', () => ({
  runDiplomacyMaintenance: vi.fn(async () => ({ processed: 0 })),
}));
vi.mock('../src/diplomacy/treaty.service.js', () => ({
  getDiplomacyModifiers: vi.fn(async () => new Map()),
}));

const { advanceWorldSimulation } = await import('../src/simulation/simulation.serverless.js');
const { fromDayIndex, intervalForSpeed } = await import('../src/simulation/simulation.clock.js');

const WORLD_ID = new Types.ObjectId();
const SPEED = 10;
const INTERVAL = intervalForSpeed(SPEED);
const NOW = new Date('2031-03-01T12:00:00.000Z');
const START_DAY = 40;
const DUE_DAYS = 5;

const countries = [
  {
    code: 'AAA',
    name: 'Avaland',
    gdp: 100,
    population: 1_000,
    stability: 70,
    gdpGrowth: 1,
    inflation: 2,
    debt: 40,
    tradeBalance: 0,
  },
  {
    code: 'BBB',
    name: 'Borealis',
    gdp: 80,
    population: 900,
    stability: 30,
    gdpGrowth: 0.5,
    inflation: 3,
    debt: 55,
    tradeBalance: -1,
  },
];

function worldRow(overrides: Record<string, unknown> = {}) {
  return {
    _id: WORLD_ID,
    currentSimulationDate: fromDayIndex(START_DAY),
    simulationSettings: {
      speed: SPEED,
      paused: false,
      autoAdvance: true,
      eventFrequency: 'low',
      checkpointIntervalDays: 7,
    },
    simulationState: {
      lastTickAt: new Date(NOW.getTime() - INTERVAL * DUE_DAYS),
      tickCount: START_DAY,
      lastCheckpointDay: START_DAY,
      lastStats: null,
      lastError: null,
    },
    ...overrides,
  };
}

function chain(row: unknown) {
  return { select: () => ({ lean: async () => row }), lean: async () => row };
}

describe('request-driven simulation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    worldModel.findById.mockImplementation(() => chain(worldRow()));
    worldModel.updateOne.mockResolvedValue({ acknowledged: true });
    persistence.claimTick.mockResolvedValue(true);
    persistence.loadCountrySnapshots.mockResolvedValue(countries);
    persistence.recordEvents.mockResolvedValue([]);
  });

  it('commits every due day and anchors the clock on the tick cursor', async () => {
    const result = await advanceWorldSimulation(WORLD_ID, { now: NOW });

    expect(result.advancedDays).toBe(DUE_DAYS);
    expect(result.remainingDays).toBe(0);
    expect(result.snapshot.clock.dayIndex).toBe(START_DAY + DUE_DAYS);
    expect(persistence.persistTick).toHaveBeenCalledTimes(DUE_DAYS);
    expect(result.snapshot.lastTickAt).toBe(NOW.toISOString());
  });

  it('caps a batch and leaves the remainder overdue rather than discarding it', async () => {
    const result = await advanceWorldSimulation(WORLD_ID, { now: NOW, maxDays: 2 });

    expect(result.advancedDays).toBe(2);
    expect(result.remainingDays).toBe(DUE_DAYS - 2);
    expect(result.hitBatchLimit).toBe(true);
    expect(persistence.persistTick).toHaveBeenCalledTimes(2);

    // Clock moved by exactly two intervals, so the other three days are still owed.
    expect(result.snapshot.lastTickAt).toBe(
      new Date(NOW.getTime() - INTERVAL * (DUE_DAYS - 2)).toISOString(),
    );
  });

  it('does not advance a paused world and accrues no backlog', async () => {
    worldModel.findById.mockImplementation(() =>
      chain(
        worldRow({
          simulationSettings: {
            speed: SPEED,
            paused: true,
            autoAdvance: true,
            eventFrequency: 'low',
            checkpointIntervalDays: 7,
          },
        }),
      ),
    );

    const result = await advanceWorldSimulation(WORLD_ID, { now: NOW });

    expect(result.advancedDays).toBe(0);
    expect(result.remainingDays).toBe(0);
    expect(result.snapshot.status).toBe('paused');
    expect(persistence.persistTick).not.toHaveBeenCalled();
  });

  it('skips a day another instance already committed', async () => {
    persistence.claimTick
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
      .mockResolvedValue(true);

    const result = await advanceWorldSimulation(WORLD_ID, { now: NOW });

    expect(persistence.persistTick).toHaveBeenCalledTimes(DUE_DAYS - 1);
    expect(result.advancedDays).toBe(DUE_DAYS - 1);
  });

  it('stops inside the wall-clock budget without writing a partial day', async () => {
    const result = await advanceWorldSimulation(WORLD_ID, { now: NOW, timeBudgetMs: -1 });

    expect(result.hitTimeBudget).toBe(true);
    expect(result.advancedDays).toBe(0);
    expect(persistence.persistTick).not.toHaveBeenCalled();
  });

  it('releases the claim and reports a degraded snapshot when a day fails', async () => {
    persistence.loadCountrySnapshots.mockRejectedValueOnce(new Error('countries unavailable'));

    const result = await advanceWorldSimulation(WORLD_ID, { now: NOW });

    expect(result.advancedDays).toBe(0);
    expect(persistence.releaseTick).toHaveBeenCalledWith(WORLD_ID, START_DAY + 1);
    expect(result.snapshot.status).toBe('degraded');
    expect(result.snapshot.lastError).toBe('countries unavailable');
  });

  it('anchors a world that has never ticked instead of replaying history', async () => {
    worldModel.findById.mockImplementation(() =>
      chain(
        worldRow({
          simulationState: { lastTickAt: null, tickCount: 0, lastCheckpointDay: null },
        }),
      ),
    );

    const result = await advanceWorldSimulation(WORLD_ID, { now: NOW });

    expect(result.advancedDays).toBe(0);
    expect(worldModel.updateOne).toHaveBeenCalledWith(
      { _id: WORLD_ID },
      { $set: { 'simulationState.lastTickAt': NOW } },
    );
  });
});
