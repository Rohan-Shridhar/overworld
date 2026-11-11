import { EVENT_FEED_DEFAULT_LIMIT, EVENT_FEED_MAX_LIMIT } from './simulation.constants.js';
import { simulationEngine } from './simulation.engine.js';
import type {
  SimulationEventView,
  SimulationSettings,
  SimulationSettingsPatch,
  SimulationSnapshot,
} from './simulation.types.js';

/**
 * Public surface of the simulation for the HTTP layer. Controllers never touch
 * the clock, the ledger or the models; they call these functions.
 */
async function ready(): Promise<void> {
  if (!simulationEngine.isRunning) await simulationEngine.start();
}

export async function getSimulationSnapshot(): Promise<SimulationSnapshot> {
  await ready();

  return simulationEngine.snapshot();
}

export async function updateSimulationSettings(
  patch: SimulationSettingsPatch,
): Promise<SimulationSnapshot> {
  await ready();

  return simulationEngine.updateSettings(patch);
}

export async function getSimulationEvents(limit?: number): Promise<SimulationEventView[]> {
  await ready();

  const bounded = Math.min(limit ?? EVENT_FEED_DEFAULT_LIMIT, EVENT_FEED_MAX_LIMIT);

  return simulationEngine.listEvents(bounded);
}

export async function getSimulationSettings(): Promise<SimulationSettings> {
  await ready();

  return simulationEngine.snapshot().settings;
}

/** Boots the engine after the database connects. Failures are non-fatal. */
export async function startSimulation(): Promise<SimulationSnapshot | null> {
  try {
    return await simulationEngine.start();
  } catch {
    return null;
  }
}

export function stopSimulation(): void {
  simulationEngine.stop();
}
