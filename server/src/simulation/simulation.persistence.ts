import type { Types } from 'mongoose';
import { CountryModel } from '../models/country.model.js';
import { ScheduledActionModel } from '../models/scheduled-action.model.js';
import { SimulationCheckpointModel } from '../models/simulation-checkpoint.model.js';
import { SimulationTickModel } from '../models/simulation-tick.model.js';
import { WorldEventModel } from '../models/world-event.model.js';
import { WorldModel } from '../models/world.model.js';
import { fromDayIndex, calendarOf } from './simulation.clock.js';
import type {
  CountryDayState,
  CountryDayUpdate,
  GeneratedEvent,
  SimulationEventView,
  SimulationSettings,
  SimulationStats,
} from './simulation.types.js';

export interface WorldSimulationRecord {
  lastTickAt: Date | null;
  lastDay: number;
  tickCount: number;
  lastCheckpointDay: number | null;
}

interface LeanCountryRow {
  shortCode: string;
  name: string;
  gdp: number;
  population: number;
  stability: number;
  economy?: { gdpGrowth?: number; inflation?: number; debt?: number; tradeBalance?: number };
}

/** Every country the engine needs to model, in one round trip. */
export async function loadCountrySnapshots(worldId: Types.ObjectId): Promise<CountryDayState[]> {
  const rows = (await CountryModel.find({ worldId })
    .select('shortCode name gdp population stability economy')
    .lean()) as unknown as LeanCountryRow[];

  return rows.map((row) => ({
    code: row.shortCode,
    name: row.name,
    gdp: row.gdp,
    population: row.population,
    stability: row.stability,
    gdpGrowth: row.economy?.gdpGrowth ?? 0,
    inflation: row.economy?.inflation ?? 0,
    debt: row.economy?.debt ?? 0,
    tradeBalance: row.economy?.tradeBalance ?? 0,
  }));
}

/**
 * Claims a simulated day. The unique (worldId, day) index means only the first
 * claim succeeds, which is what stops a replayed or concurrent tick from
 * applying its economic changes twice.
 */
export async function claimTick(
  worldId: Types.ObjectId,
  day: number,
  tickCount: number,
): Promise<boolean> {
  const result = await SimulationTickModel.updateOne(
    { worldId, day },
    {
      $setOnInsert: {
        worldId,
        day,
        tickCount,
        committedAt: new Date(),
        durationMs: 0,
      },
    },
    { upsert: true },
  );

  return result.upsertedCount > 0;
}

/** Releases a claim whose tick failed before it committed anything. */
export async function releaseTick(worldId: Types.ObjectId, day: number): Promise<void> {
  await SimulationTickModel.deleteOne({ worldId, day });
}

export interface PersistTickInput {
  worldId: Types.ObjectId;
  day: number;
  settings: SimulationSettings;
  updates: CountryDayUpdate[];
  /** Real-time instant this tick is anchored to, not necessarily `now`. */
  lastTickAt: Date;
  lastCheckpointDay?: number | null;
  durationMs: number;
  /** Persisted with the clock so snapshot reads stay cheap. */
  stats?: SimulationStats;
}

/**
 * Writes the tick's outcome. Countries are updated in one bulk write so a tick
 * cannot leave half the world on yesterday's numbers.
 */
export async function persistTick(input: PersistTickInput): Promise<void> {
  const { worldId, day, settings, updates, lastTickAt, lastCheckpointDay, durationMs, stats } = input;

  const worldUpdate: Record<string, unknown> = {
    currentSimulationDate: fromDayIndex(day),
    'simulationSettings.speed': settings.speed,
    'simulationSettings.paused': settings.paused,
    'simulationSettings.autoAdvance': settings.autoAdvance,
    'simulationSettings.eventFrequency': settings.eventFrequency,
    'simulationSettings.checkpointIntervalDays': settings.checkpointIntervalDays,
    'simulationState.lastTickAt': lastTickAt,
    'simulationState.lastDay': day,
    'simulationState.lastError': null,
  };

  if (stats) {
    worldUpdate['simulationState.lastStats'] = { ...stats };
  }

  if (lastCheckpointDay != null) {
    worldUpdate['simulationState.lastCheckpointDay'] = lastCheckpointDay;
  }

  await WorldModel.updateOne(
    { _id: worldId },
    { $set: worldUpdate, $inc: { 'simulationState.tickCount': 1 } },
  );

  await SimulationTickModel.updateOne({ worldId, day }, { $set: { durationMs } });

  if (updates.length > 0) {
    await CountryModel.bulkWrite(
      updates.map((update) => ({
        updateOne: {
          filter: { worldId, shortCode: update.code },
          update: {
            $set: {
              gdp: update.gdp,
              stability: update.stability,
              'economy.gdpGrowth': update.economy.gdpGrowth,
              'economy.inflation': update.economy.inflation,
              'economy.debt': update.economy.debt,
              'economy.tradeBalance': update.economy.tradeBalance,
            },
          },
        },
      })),
      { ordered: false },
    );
  }
}

export async function recordEvents(
  worldId: Types.ObjectId,
  day: number,
  events: GeneratedEvent[],
): Promise<SimulationEventView[]> {
  if (events.length === 0) return [];

  const occurredAt = fromDayIndex(day);

  const inserted = await WorldEventModel.insertMany(
    events.map((event) => ({
      worldId,
      day,
      occurredAt,
      category: event.category,
      headline: event.headline,
      detail: event.detail,
      countryCode: event.countryCode,
      countryName: event.countryName,
      severity: event.severity,
      stabilityEffect: event.stabilityEffect,
      growthEffect: event.growthEffect,
    })),
  );

  return inserted.map((event) => toEventView(event, day));
}

export function toEventView(
  event: {
    _id?: unknown;
    day: number;
    occurredAt: Date | string;
    category: string;
    headline: string;
    detail: string;
    countryCode?: string | null;
    countryName?: string | null;
    severity?: string;
  },
  fallbackDay?: number,
): SimulationEventView {
  const day = event.day ?? fallbackDay ?? 0;
  const parts = calendarOf(day);

  return {
    id: String(event._id ?? `${day}-${event.headline}`),
    day,
    occurredAt: new Date(event.occurredAt).toISOString(),
    dateLabel: `${String(parts.day).padStart(2, '0')} ${parts.monthName.toUpperCase()} ${parts.year}`,
    category: event.category,
    headline: event.headline,
    detail: event.detail,
    countryCode: event.countryCode ?? null,
    countryName: event.countryName ?? null,
    severity: (event.severity ?? 'low') as SimulationEventView['severity'],
  };
}

export async function loadRecentEvents(
  worldId: Types.ObjectId,
  limit: number,
): Promise<SimulationEventView[]> {
  const events = await WorldEventModel.find({ worldId }).sort({ day: -1, createdAt: -1 }).limit(limit).lean();

  return events.map((event) => toEventView(event as unknown as Parameters<typeof toEventView>[0]));
}

export async function saveCheckpoint(
  worldId: Types.ObjectId,
  day: number,
  tickCount: number,
  stats: SimulationStats,
): Promise<void> {
  await SimulationCheckpointModel.updateOne(
    { worldId, day },
    {
      $setOnInsert: {
        worldId,
        day,
        simulationDate: fromDayIndex(day),
        tickCount,
        stats: {
          countries: stats.countries,
          totalGdp: stats.totalGdp,
          averageStability: stats.averageStability,
          averageGrowth: stats.averageGrowth,
        },
      },
    },
    { upsert: true },
  );
}

/** Applies an event's small effect to the country it happened in. */
export function applyEventEffect(
  update: CountryDayUpdate,
  event: GeneratedEvent,
): CountryDayUpdate {
  return {
    ...update,
    stability: Math.min(99, Math.max(4, Math.round((update.stability + event.stabilityEffect) * 100) / 100)),
    economy: {
      ...update.economy,
      gdpGrowth:
        Math.round((update.economy.gdpGrowth + event.growthEffect) * 100) / 100,
    },
  };
}

export async function countPendingActions(worldId: Types.ObjectId): Promise<number> {
  return ScheduledActionModel.countDocuments({ worldId, status: 'pending' });
}
