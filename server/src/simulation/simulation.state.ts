import {
  DEFAULT_CHECKPOINT_INTERVAL_DAYS,
  DEFAULT_EVENT_FREQUENCY,
  DEFAULT_SPEED,
} from './simulation.constants.js';
import type { SimulationSettings, SimulationStats, SimulationStatus } from './simulation.types.js';

export interface SimulationStateValues {
  settings: SimulationSettings;
  status: SimulationStatus;
  day: number;
  lastTickAt: Date | null;
  tickCount: number;
  lastCheckpointDay: number | null;
  lastRestoredAt: Date | null;
  stats: SimulationStats;
  lastError: string | null;
}

export const DEFAULT_SIMULATION_SETTINGS: SimulationSettings = {
  speed: DEFAULT_SPEED,
  paused: false,
  autoAdvance: true,
  eventFrequency: DEFAULT_EVENT_FREQUENCY,
  checkpointIntervalDays: DEFAULT_CHECKPOINT_INTERVAL_DAYS,
  difficulty: 'standard',
  startYear: 2031,
};

const EMPTY_STATS: SimulationStats = {
  countries: 0,
  totalGdp: 0,
  averageStability: 0,
  averageGrowth: 0,
  eventsToday: 0,
};

/**
 * Authoritative in-memory mirror of the persisted simulation settings.
 *
 * The engine writes through this object and persists it on every tick; the API
 * reads it so a settings change is visible before the next save completes.
 */
export class SimulationState {
  private values: SimulationStateValues;

  constructor(initial: Partial<SimulationStateValues> = {}) {
    this.values = {
      settings: { ...DEFAULT_SIMULATION_SETTINGS, ...initial.settings },
      status: initial.status ?? 'stopped',
      day: initial.day ?? 0,
      lastTickAt: initial.lastTickAt ?? null,
      tickCount: initial.tickCount ?? 0,
      lastCheckpointDay: initial.lastCheckpointDay ?? null,
      lastRestoredAt: initial.lastRestoredAt ?? null,
      stats: initial.stats ?? { ...EMPTY_STATS },
      lastError: initial.lastError ?? null,
    };
  }

  read(): Readonly<SimulationStateValues> {
    return this.values;
  }

  get settings(): SimulationSettings {
    return this.values.settings;
  }

  get day(): number {
    return this.values.day;
  }

  get status(): SimulationStatus {
    return this.values.status;
  }

  patchSettings(patch: Partial<SimulationSettings>): SimulationSettings {
    this.values.settings = { ...this.values.settings, ...patch };
    this.values.status = this.deriveStatus();

    return this.values.settings;
  }

  /** Speed and pause controls both decide whether the clock is allowed to move. */
  deriveStatus(): SimulationStatus {
    const settings = this.values.settings;

    if (!settings.autoAdvance || settings.paused) return 'paused';

    return this.values.status === 'stopped' ? 'stopped' : 'running';
  }

  setStatus(status: SimulationStatus): void {
    this.values.status = status;
  }

  advanceTo(day: number, lastTickAt: Date, stats: SimulationStats): void {
    this.values.day = day;
    this.values.lastTickAt = lastTickAt;
    this.values.tickCount += 1;
    this.values.stats = stats;
    this.values.lastError = null;
    this.values.status = this.values.settings.paused ? 'paused' : 'running';
  }

  restore(day: number, lastTickAt: Date | null, tickCount: number, lastCheckpointDay: number | null): void {
    this.values.day = day;
    this.values.lastTickAt = lastTickAt;
    this.values.tickCount = tickCount;
    this.values.lastCheckpointDay = lastCheckpointDay;
    this.values.lastRestoredAt = new Date();
    this.values.status = this.deriveStatus();
  }

  noteCheckpoint(day: number): void {
    this.values.lastCheckpointDay = day;
  }

  /** Anchors the real-time clock without advancing the simulated day. */
  anchor(lastTickAt: Date): void {
    this.values.lastTickAt = lastTickAt;
  }

  /**
   * Moves the clock onto a day that is already committed in the ledger, without
   * writing it again. Used when a duplicate tick is detected after a restart.
   */
  syncDay(day: number): void {
    this.values.day = day;
    this.values.lastTickAt = new Date();
  }

  fail(message: string): void {
    this.values.lastError = message;
    this.values.status = 'degraded';
  }

  clearError(): void {
    this.values.lastError = null;
  }

  setStats(stats: SimulationStats): void {
    this.values.stats = stats;
  }
}
