import type { Types } from 'mongoose';
import { isServerlessRuntime } from '../config/constants.js';
import { ensureDefaultWorld } from '../world/world.service.js';
import { EVENT_FEED_DEFAULT_LIMIT, EVENT_FEED_MAX_LIMIT } from './simulation.constants.js';
import { simulationEngine } from './simulation.engine.js';
import { loadRecentEvents } from './simulation.persistence.js';
import {
  advanceWorldSimulation,
  readWorldSnapshot,
  updateWorldSettings,
  type AdvanceResult,
} from './simulation.serverless.js';
import type {
  SimulationEventView,
  SimulationSettings,
  SimulationSettingsPatch,
  SimulationSnapshot,
  TickOutcome,
} from './simulation.types.js';

/**
 * Public surface of the simulation for the HTTP layer.
 *
 * Two execution modes share this API:
 *
 * - **Long-lived process** (local development, a traditional host): the timer
 *   engine owns the clock and its in-memory snapshot is authoritative.
 * - **Serverless** (Vercel): there is no process to own a timer, so every call
 *   reads the clock from MongoDB and advances the days that are due.
 *
 * Controllers never choose between them.
 */
async function ready(): Promise<void> {
  if (!simulationEngine.isRunning) await simulationEngine.start();
}

function boundedLimit(limit?: number): number {
  return Math.min(limit ?? EVENT_FEED_DEFAULT_LIMIT, EVENT_FEED_MAX_LIMIT);
}

async function worldId(): Promise<Types.ObjectId> {
  const world = await ensureDefaultWorld();

  return world._id as Types.ObjectId;
}

export async function getSimulationSnapshot(): Promise<SimulationSnapshot> {
  if (isServerlessRuntime()) {
    return readWorldSnapshot(await worldId());
  }

  await ready();

  return simulationEngine.snapshot();
}

export async function updateSimulationSettings(
  patch: SimulationSettingsPatch,
): Promise<SimulationSnapshot> {
  if (isServerlessRuntime()) {
    return updateWorldSettings(await worldId(), patch);
  }

  await ready();

  return simulationEngine.updateSettings(patch);
}

export async function getSimulationEvents(limit?: number): Promise<SimulationEventView[]> {
  const bounded = boundedLimit(limit);

  if (isServerlessRuntime()) {
    return loadRecentEvents(await worldId(), bounded);
  }

  await ready();

  return simulationEngine.listEvents(bounded);
}

export async function getSimulationSettings(): Promise<SimulationSettings> {
  if (isServerlessRuntime()) {
    return (await readWorldSnapshot(await worldId())).settings;
  }

  await ready();

  return simulationEngine.snapshot().settings;
}

/**
 * Advances the simulation on demand.
 *
 * On Vercel this is the primary mechanism: each call commits a bounded batch of
 * overdue days and reports how many remain, so a caller can keep going without
 * the backlog being discarded by a function timeout.
 */
export async function advanceSimulation(options: {
  maxDays?: number;
} = {}): Promise<AdvanceResult> {
  if (isServerlessRuntime()) {
    return advanceWorldSimulation(await worldId(), { maxDays: options.maxDays });
  }

  await ready();

  const outcome: TickOutcome = await simulationEngine.tickNow();

  return {
    snapshot: simulationEngine.snapshot(),
    advancedDays: outcome.advanced ? 1 : 0,
    remainingDays: 0,
    events: outcome.events,
    hitBatchLimit: false,
    hitTimeBudget: false,
  };
}

/** Boots the timer engine after the database connects. Failures are non-fatal. */
export async function startSimulation(): Promise<SimulationSnapshot | null> {
  if (isServerlessRuntime()) return null;

  try {
    return await simulationEngine.start();
  } catch {
    return null;
  }
}

export function stopSimulation(): void {
  if (isServerlessRuntime()) return;

  simulationEngine.stop();
}
