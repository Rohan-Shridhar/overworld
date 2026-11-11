import type {
  EventFrequency,
  SimulationEventCategory,
  SimulationSpeed,
} from './simulation.constants.js';
import type { SimulationClock } from './simulation.clock.js';

export type SimulationStatus = 'running' | 'paused' | 'stopped' | 'degraded';

export interface SimulationSettings {
  speed: SimulationSpeed;
  paused: boolean;
  autoAdvance: boolean;
  eventFrequency: EventFrequency;
  checkpointIntervalDays: number;
  difficulty: string;
  startYear: number;
}

export interface SimulationStats {
  countries: number;
  totalGdp: number;
  averageStability: number;
  averageGrowth: number;
  eventsToday: number;
}

export interface SimulationSnapshot {
  clock: SimulationClock;
  settings: SimulationSettings;
  status: SimulationStatus;
  stats: SimulationStats;
  /** Real-time instant the last committed tick ran at. */
  lastTickAt: string | null;
  /** Real-time instant the next scheduled tick is due. */
  nextTickAt: string | null;
  tickCount: number;
  lastCheckpointDay: number | null;
  lastError: string | null;
}

export interface CountryDayState {
  code: string;
  name: string;
  gdp: number;
  population: number;
  stability: number;
  gdpGrowth: number;
  inflation: number;
  debt: number;
  tradeBalance: number;
}

export interface CountryDayUpdate {
  code: string;
  gdp: number;
  stability: number;
  economy: {
    gdpGrowth: number;
    inflation: number;
    debt: number;
    tradeBalance: number;
  };
}

export interface GeneratedEvent {
  category: SimulationEventCategory;
  headline: string;
  detail: string;
  countryCode: string | null;
  countryName: string | null;
  severity: 'low' | 'medium' | 'high';
  stabilityEffect: number;
  growthEffect: number;
}

export interface SimulationEventView {
  id: string;
  day: number;
  occurredAt: string;
  dateLabel: string;
  category: SimulationEventCategory | string;
  headline: string;
  detail: string;
  countryCode: string | null;
  countryName: string | null;
  severity: 'low' | 'medium' | 'high';
}

export interface TickOutcome {
  day: number;
  processed: boolean;
  advanced: boolean;
  reason?: 'paused' | 'duplicate' | 'busy' | 'not-ready';
  events: SimulationEventView[];
  checkpointWritten: boolean;
  durationMs: number;
}

export interface SimulationSettingsPatch {
  speed?: SimulationSpeed;
  paused?: boolean;
  autoAdvance?: boolean;
  eventFrequency?: EventFrequency;
  checkpointIntervalDays?: number;
}
