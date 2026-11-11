/**
 * Simulation configuration.
 *
 * Like the rest of the server configuration these are constants, not
 * environment variables: `MONGODB_URI` stays the only application variable.
 */

/** Instant the generated world's clock starts at. */
export const SIMULATION_EPOCH_ISO = '2031-01-01T00:00:00.000Z';

/**
 * 1x means one simulated day per real-time minute. Every other speed divides
 * this interval, so 2x advances a day every 30s and 10x every 6s.
 */
export const REAL_MS_PER_SIMULATED_DAY = 60_000;

export const SUPPORTED_SPEEDS = [0.5, 1, 2, 5, 10] as const;

export type SimulationSpeed = (typeof SUPPORTED_SPEEDS)[number];

export const DEFAULT_SPEED: SimulationSpeed = 1;

/** A generated world starts running: the clock is not tied to user interaction. */
export const DEFAULT_PAUSED = false;
export const DEFAULT_AUTO_ADVANCE = true;

export const SIMULATION_SPEEDS: ReadonlyArray<SimulationSpeed> = SUPPORTED_SPEEDS;

/** The fictional calendar: twelve months of thirty days, 360-day years. */
export const DAYS_PER_MONTH = 30;
export const MONTHS_PER_YEAR = 12;

export const MONTH_NAMES = [
  'Janus',
  'Febris',
  'Marta',
  'Aprilis',
  'Maius',
  'Junius',
  'Julius',
  'Augustus',
  'Septis',
  'Octavis',
  'Novis',
  'Decis',
] as const;

export const EVENT_FREQUENCIES = ['low', 'normal', 'high'] as const;

export type EventFrequency = (typeof EVENT_FREQUENCIES)[number];

/** Probability that a single simulated day produces a world event. */
export const EVENT_FREQUENCY_CHANCE: Record<EventFrequency, number> = {
  low: 0.1,
  normal: 0.28,
  high: 0.55,
};

export const DEFAULT_EVENT_FREQUENCY: EventFrequency = 'normal';

/** A country at or above this stability can recover its government record. */
export const STABILITY_RECOVERY_THRESHOLD = 62;

/** How many schedule reviews a single tick may drain. */
export const MAX_ACTIONS_PER_TICK = 20;

/** A checkpoint snapshot is written every this many simulated days. */
export const DEFAULT_CHECKPOINT_INTERVAL_DAYS = 7;
export const MIN_CHECKPOINT_INTERVAL_DAYS = 1;
export const MAX_CHECKPOINT_INTERVAL_DAYS = 30;

/**
 * After downtime the engine replays the elapsed days so the world does not
 * freeze while the API was down. The replay is bounded so a long outage cannot
 * stall a request; anything beyond the bound is skipped, not simulated twice.
 */
export const MAX_CATCH_UP_DAYS = 240;

/** Minimum delay between scheduled ticks, so 10x never spins the event loop. */
export const MIN_TICK_DELAY_MS = 500;

/** How many committed ticks the engine remembers for its own diagnostics. */
export const TICK_LEDGER_RETENTION_DAYS = 600;

export const SIMULATION_EVENT_CATEGORIES = [
  'economy',
  'society',
  'climate',
  'infrastructure',
  'administration',
] as const;

export type SimulationEventCategory = (typeof SIMULATION_EVENT_CATEGORIES)[number];

/** Stability at or below this level files a review action for the next day. */
export const STABILITY_REVIEW_THRESHOLD = 32;

/** Maximum days of history kept in the event feed query. */
export const EVENT_FEED_DEFAULT_LIMIT = 40;
export const EVENT_FEED_MAX_LIMIT = 200;
