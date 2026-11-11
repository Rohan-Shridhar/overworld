import {
  DEFAULT_AUTO_ADVANCE,
  DEFAULT_CHECKPOINT_INTERVAL_DAYS,
  DEFAULT_EVENT_FREQUENCY,
  DEFAULT_PAUSED,
  DEFAULT_SPEED,
  SUPPORTED_SPEEDS,
  type EventFrequency,
  type SimulationSpeed,
} from './simulation.constants.js';
import type { SimulationSettings, SimulationSettingsPatch, SimulationStats } from './simulation.types.js';

/** Shape of `world.simulationSettings` as stored, including legacy values. */
export interface WorldSettingsSource {
  speed?: unknown;
  paused?: boolean;
  autoAdvance?: boolean;
  eventFrequency?: string;
  checkpointIntervalDays?: number;
  difficulty?: string;
  startYear?: number;
}

export const DEFAULT_SIMULATION_SETTINGS: SimulationSettings = {
  speed: DEFAULT_SPEED,
  paused: DEFAULT_PAUSED,
  autoAdvance: DEFAULT_AUTO_ADVANCE,
  eventFrequency: DEFAULT_EVENT_FREQUENCY,
  checkpointIntervalDays: DEFAULT_CHECKPOINT_INTERVAL_DAYS,
  difficulty: 'standard',
  startYear: 2031,
};

export const EMPTY_SIMULATION_STATS: SimulationStats = {
  countries: 0,
  totalGdp: 0,
  averageStability: 0,
  averageGrowth: 0,
  eventsToday: 0,
};

/** Legacy rows stored `speed: "paused"`; anything unrecognised falls back to 1x. */
export function normaliseSpeed(value: unknown): SimulationSpeed {
  const parsed = typeof value === 'number' ? value : Number(value);

  return SUPPORTED_SPEEDS.find((speed) => speed === parsed) ?? DEFAULT_SPEED;
}

const EVENT_FREQUENCIES: ReadonlyArray<EventFrequency> = ['low', 'normal', 'high'];

export function normaliseFrequency(value: unknown): EventFrequency {
  return EVENT_FREQUENCIES.find((frequency) => frequency === value) ?? DEFAULT_EVENT_FREQUENCY;
}

export function settingsFromWorld(raw: WorldSettingsSource | undefined): SimulationSettings {
  return {
    speed: normaliseSpeed(raw?.speed),
    paused: raw?.paused ?? DEFAULT_PAUSED,
    autoAdvance: raw?.autoAdvance ?? DEFAULT_AUTO_ADVANCE,
    eventFrequency: normaliseFrequency(raw?.eventFrequency),
    checkpointIntervalDays: raw?.checkpointIntervalDays ?? DEFAULT_CHECKPOINT_INTERVAL_DAYS,
    difficulty: raw?.difficulty ?? DEFAULT_SIMULATION_SETTINGS.difficulty,
    startYear: raw?.startYear ?? DEFAULT_SIMULATION_SETTINGS.startYear,
  };
}

/** Applies a validated patch to the current settings, clamped to safe ranges. */
export function mergeSettings(
  current: SimulationSettings,
  patch: SimulationSettingsPatch,
): SimulationSettings {
  const next: SimulationSettings = { ...current };

  if (patch.speed !== undefined) next.speed = normaliseSpeed(patch.speed);
  if (patch.paused !== undefined) next.paused = patch.paused;
  if (patch.autoAdvance !== undefined) next.autoAdvance = patch.autoAdvance;
  if (patch.eventFrequency !== undefined) next.eventFrequency = normaliseFrequency(patch.eventFrequency);
  if (patch.checkpointIntervalDays !== undefined) {
    next.checkpointIntervalDays = Math.min(30, Math.max(1, Math.round(patch.checkpointIntervalDays)));
  }

  return next;
}
