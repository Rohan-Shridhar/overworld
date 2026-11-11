import type { Types } from 'mongoose';
import { runDiplomacyMaintenance } from '../diplomacy/diplomacy.maintenance.js';
import { getDiplomacyModifiers } from '../diplomacy/treaty.service.js';
import { logger } from '../lib/logger.js';
import { WorldModel } from '../models/world.model.js';
import { AppError } from '../utils/app-error.js';
import { createRandom } from '../world/generator/seeded-random.js';
import {
  clockOf,
  elapsedDays,
  intervalForSpeed,
  nextTickAt,
  toDayIndex,
} from './simulation.clock.js';
import { SERVERLESS_MAX_DAYS_PER_REQUEST, SERVERLESS_TIME_BUDGET_MS } from '../config/constants.js';
import type { SimulationSpeed } from './simulation.constants.js';
import {
  drainScheduledActions,
  queueStabilityReviews,
} from './simulation.actions.js';
import {
  claimTick,
  loadCountrySnapshots,
  persistTick,
  recordEvents,
  releaseTick,
  saveCheckpoint,
} from './simulation.persistence.js';
import {
  aggregateStats,
  generateWorldEvent,
  pickEventCountry,
  shouldGenerateEvent,
  simulateCountryDay,
} from './simulation.rules.js';
import {
  EMPTY_SIMULATION_STATS,
  mergeSettings,
  settingsFromWorld,
  type WorldSettingsSource,
} from './simulation.settings.js';
import { EVENT_FREQUENCY_CHANCE } from './simulation.constants.js';
import type {
  CountryDayState,
  CountryDayUpdate,
  GeneratedEvent,
  SimulationEventView,
  SimulationSettings,
  SimulationSettingsPatch,
  SimulationSnapshot,
  SimulationStats,
  SimulationStatus,
} from './simulation.types.js';

/**
 * Request-driven simulation.
 *
 * On Vercel a function instance is created and discarded at will, so no timer
 * can own the clock. MongoDB is the only authoritative state: every request
 * that touches the simulation reads the persisted clock, processes the days
 * that are due, and writes the clock back. Nothing is held in module scope.
 *
 * Overdue days are never dropped to fit inside an invocation: each request
 * processes at most `SERVERLESS_MAX_DAYS_PER_REQUEST` days inside a time
 * budget, and `simulationState.lastTickAt` only moves forward by the days that
 * were actually committed. Whatever is left stays overdue and the next request
 * continues from there.
 */

interface SimulationStateRow {
  lastTickAt?: Date | null;
  lastDay?: number;
  tickCount?: number;
  lastCheckpointDay?: number | null;
  lastStats?: SimulationStats | null;
  lastError?: string | null;
}

export interface WorldSimulationRow {
  _id: Types.ObjectId;
  currentSimulationDate: Date;
  simulationSettings?: WorldSettingsSource;
  simulationState?: SimulationStateRow;
}

export interface AdvanceOptions {
  now?: Date;
  /** Hard cap on simulated days committed by this invocation. */
  maxDays?: number;
  timeBudgetMs?: number;
}

export interface AdvanceResult {
  snapshot: SimulationSnapshot;
  advancedDays: number;
  /** Days still overdue after this invocation. Non-zero means call again. */
  remainingDays: number;
  events: SimulationEventView[];
  hitBatchLimit: boolean;
  hitTimeBudget: boolean;
}

const WORLD_ROW_PROJECTION =
  'currentSimulationDate simulationSettings simulationState.lastTickAt simulationState.tickCount simulationState.lastCheckpointDay simulationState.lastStats simulationState.lastError';

async function readWorldRow(worldId: Types.ObjectId): Promise<WorldSimulationRow> {
  const row = await WorldModel.findById(worldId)
    .select(WORLD_ROW_PROJECTION)
    .lean();

  if (!row) throw AppError.notFound('The world no longer exists');

  return row as unknown as WorldSimulationRow;
}

function statusOf(settings: SimulationSettings, lastError: string | null): SimulationStatus {
  if (settings.paused || !settings.autoAdvance) return 'paused';
  if (lastError) return 'degraded';

  return 'running';
}

function buildSnapshot(
  row: WorldSimulationRow,
  settings: SimulationSettings,
  overrides: {
    day?: number;
    lastTickAt?: Date | null;
    tickCount?: number;
    lastCheckpointDay?: number | null;
    stats?: SimulationStats;
    lastError?: string | null;
  } = {},
): SimulationSnapshot {
  const day = overrides.day ?? toDayIndex(new Date(row.currentSimulationDate));
  const lastTickAt =
    overrides.lastTickAt !== undefined ? overrides.lastTickAt : (row.simulationState?.lastTickAt ?? null);
  const paused = settings.paused || !settings.autoAdvance;
  const lastError = overrides.lastError !== undefined ? overrides.lastError : (row.simulationState?.lastError ?? null);

  return {
    clock: clockOf(day),
    settings: { ...settings },
    status: statusOf(settings, lastError),
    stats: overrides.stats ?? row.simulationState?.lastStats ?? { ...EMPTY_SIMULATION_STATS },
    lastTickAt: lastTickAt ? lastTickAt.toISOString() : null,
    nextTickAt: !paused && lastTickAt ? nextTickAt(lastTickAt, settings.speed).toISOString() : null,
    tickCount: overrides.tickCount ?? row.simulationState?.tickCount ?? 0,
    lastCheckpointDay:
      overrides.lastCheckpointDay !== undefined
        ? overrides.lastCheckpointDay
        : (row.simulationState?.lastCheckpointDay ?? null),
    lastError,
  };
}

/** Reads the persisted clock and settings. Never advances anything. */
export async function readWorldSnapshot(worldId: Types.ObjectId): Promise<SimulationSnapshot> {
  const row = await readWorldRow(worldId);

  return buildSnapshot(row, settingsFromWorld(row.simulationSettings));
}

/** PATCH /api/simulation — persisted, so every function instance observes it. */
export async function updateWorldSettings(
  worldId: Types.ObjectId,
  patch: SimulationSettingsPatch,
  now: Date = new Date(),
): Promise<SimulationSnapshot> {
  const row = await readWorldRow(worldId);
  const next = mergeSettings(settingsFromWorld(row.simulationSettings), patch);

  await WorldModel.updateOne(
    { _id: worldId },
    {
      $set: {
        'simulationSettings.speed': next.speed,
        'simulationSettings.paused': next.paused,
        'simulationSettings.autoAdvance': next.autoAdvance,
        'simulationSettings.eventFrequency': next.eventFrequency,
        'simulationSettings.checkpointIntervalDays': next.checkpointIntervalDays,
        // A paused world does not accrue overdue days while it is stopped.
        ...(next.paused || !next.autoAdvance ? { 'simulationState.lastTickAt': now } : {}),
      },
    },
  );

  return buildSnapshot(row, next, { lastTickAt: next.paused || !next.autoAdvance ? now : undefined });
}

function seedKey(worldId: Types.ObjectId): string {
  return `sim:${String(worldId)}`;
}

function generateForDay(
  worldId: Types.ObjectId,
  day: number,
  countries: CountryDayState[],
  updates: CountryDayUpdate[],
  settings: SimulationSettings,
): GeneratedEvent[] {
  const random = createRandom(`${seedKey(worldId)}:${day}:events`);

  if (!shouldGenerateEvent(random, EVENT_FREQUENCY_CHANCE[settings.eventFrequency])) return [];

  const country = pickEventCountry(countries, random);
  if (!country) return [];

  const event = generateWorldEvent(country, random);
  const index = updates.findIndex((update) => update.code === country.code);

  if (index >= 0 && updates[index]) {
    updates[index] = applyEvent(updates[index], event);
  }

  return [event];
}

/** Local copy of the engine's effect application; kept private to avoid import cycles. */
function applyEvent(update: CountryDayUpdate, event: GeneratedEvent): CountryDayUpdate {
  return {
    ...update,
    stability: Math.min(99, Math.max(4, Math.round((update.stability + event.stabilityEffect) * 100) / 100)),
    economy: {
      ...update.economy,
      gdpGrowth: Math.round((update.economy.gdpGrowth + event.growthEffect) * 100) / 100,
    },
  };
}

function computeStats(updates: CountryDayUpdate[], events: GeneratedEvent[]): SimulationStats {
  const aggregate = aggregateStats(
    updates.map((update) => ({
      gdp: update.gdp,
      stability: update.stability,
      gdpGrowth: update.economy.gdpGrowth,
    })),
  );

  return { ...aggregate, eventsToday: events.length };
}

/**
 * Commits simulated days that are due, bounded by a day budget and a wall-clock
 * budget. Returns whatever is still overdue so the caller can schedule another
 * pass rather than losing the backlog.
 */
export async function advanceWorldSimulation(
  worldId: Types.ObjectId,
  options: AdvanceOptions = {},
): Promise<AdvanceResult> {
  const now = options.now ?? new Date();
  const startedAt = Date.now();
  const row = await readWorldRow(worldId);
  const settings = settingsFromWorld(row.simulationSettings);
  const state = row.simulationState ?? {};

  let day = toDayIndex(new Date(row.currentSimulationDate));
  let tickCount = state.tickCount ?? 0;
  let lastCheckpointDay = state.lastCheckpointDay ?? null;
  let lastStats = state.lastStats ?? { ...EMPTY_SIMULATION_STATS };
  let lastError: string | null = state.lastError ?? null;
  let lastTickAt = state.lastTickAt ?? null;

  const paused = settings.paused || !settings.autoAdvance;

  // First ever request: anchor the clock without inventing history.
  if (!lastTickAt) {
    lastTickAt = now;
    await WorldModel.updateOne({ _id: worldId }, { $set: { 'simulationState.lastTickAt': now } });
  }

  const due = paused ? 0 : elapsedDays(lastTickAt, now, settings.speed);
  const maxDays = Math.max(1, options.maxDays ?? SERVERLESS_MAX_DAYS_PER_REQUEST);
  const timeBudgetMs = options.timeBudgetMs ?? SERVERLESS_TIME_BUDGET_MS;
  const batch = Math.min(due, maxDays);

  let advancedDays = 0;
  let consumedDays = 0;
  let hitTimeBudget = false;
  const events: SimulationEventView[] = [];

  for (let index = 0; index < batch; index += 1) {
    if (Date.now() - startedAt > timeBudgetMs) {
      hitTimeBudget = true;
      break;
    }

    const nextDay = day + 1;
    const committedAt = nextTickAt(lastTickAt, settings.speed);
    let claimed = false;

    try {
      claimed = await claimTick(worldId, nextDay, tickCount + 1);

      if (!claimed) {
        // Another instance already committed this day: adopt its clock and move on.
        const fresh = await readWorldRow(worldId);

        day = toDayIndex(new Date(fresh.currentSimulationDate));
        lastTickAt = fresh.simulationState?.lastTickAt ?? committedAt;
        tickCount = fresh.simulationState?.tickCount ?? tickCount;
        lastCheckpointDay = fresh.simulationState?.lastCheckpointDay ?? lastCheckpointDay;
        lastStats = fresh.simulationState?.lastStats ?? lastStats;
        consumedDays += 1;
        continue;
      }

      const countries = await loadCountrySnapshots(worldId);

      if (countries.length === 0) throw new Error('The world has no countries to simulate');

      const modifiers = await getDiplomacyModifiers(worldId);
      const updates = countries.map((country) =>
        simulateCountryDay(
          country,
          createRandom(`${seedKey(worldId)}:${nextDay}:${country.code}`),
          modifiers.get(country.code),
        ),
      );

      const generated = generateForDay(worldId, nextDay, countries, updates, settings);
      const stats = computeStats(updates, generated);
      const checkpointDue =
        lastCheckpointDay !== null && nextDay - lastCheckpointDay >= settings.checkpointIntervalDays;

      await persistTick({
        worldId,
        day: nextDay,
        settings,
        updates,
        // Anchoring on the tick cursor (not `now`) is what keeps the backlog intact.
        lastTickAt: committedAt,
        lastCheckpointDay: checkpointDue ? nextDay : null,
        durationMs: Date.now() - startedAt,
        stats,
      });

      const recorded = await recordEvents(worldId, nextDay, generated);
      events.push(...recorded);

      if (checkpointDue) {
        await saveCheckpoint(worldId, nextDay, tickCount + 1, stats);
        lastCheckpointDay = nextDay;
      }

      await drainScheduledActions(worldId, nextDay);
      await runDiplomacyMaintenance(worldId, nextDay);
      await queueStabilityReviews(worldId, { updates, namesByCode: new Map(countries.map((c) => [c.code, c.name])), day: nextDay });

      day = nextDay;
      lastTickAt = committedAt;
      tickCount += 1;
      lastStats = stats;
      lastError = null;
      advancedDays += 1;
      consumedDays += 1;
    } catch (error) {
      if (claimed) await releaseTick(worldId, nextDay).catch(() => undefined);

      lastError = error instanceof Error ? error.message : String(error);
      logger.error('Request-driven simulation day failed', { day: nextDay, error });

      await WorldModel.updateOne(
        { _id: worldId },
        { $set: { 'simulationState.lastError': lastError } },
      ).catch(() => undefined);

      break;
    }
  }

  const remainingDays = paused ? 0 : Math.max(0, due - consumedDays);

  return {
    snapshot: buildSnapshot(row, settings, {
      day,
      lastTickAt,
      tickCount,
      lastCheckpointDay,
      stats: lastStats,
      lastError,
    }),
    advancedDays,
    remainingDays,
    events,
    hitBatchLimit: batch < due && !hitTimeBudget,
    hitTimeBudget,
  };
}

/** Exposed for tests and diagnostics: the real-time gap between two days. */
export function tickIntervalMs(speed: SimulationSpeed): number {
  return intervalForSpeed(speed);
}
