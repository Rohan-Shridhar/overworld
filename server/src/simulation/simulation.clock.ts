import {
  DAYS_PER_MONTH,
  MIN_TICK_DELAY_MS,
  MONTH_NAMES,
  MONTHS_PER_YEAR,
  REAL_MS_PER_SIMULATED_DAY,
  SIMULATION_EPOCH_ISO,
  type SimulationSpeed,
} from './simulation.constants.js';

/** Milliseconds in one simulated day. */
export const MS_PER_DAY = 86_400_000;

export const SIMULATION_EPOCH = new Date(SIMULATION_EPOCH_ISO);

export interface SimulationDateParts {
  year: number;
  monthIndex: number;
  monthName: string;
  /** Day of month, 1-based. */
  day: number;
  /** Days elapsed since the world epoch, 0-based. */
  dayIndex: number;
}

export interface SimulationClock extends SimulationDateParts {
  iso: string;
  label: string;
}

function pad(value: number, length = 2): string {
  return String(value).padStart(length, '0');
}

/** Days elapsed since the world epoch. Deterministic and timezone-free. */
export function toDayIndex(date: Date): number {
  return Math.floor((date.getTime() - SIMULATION_EPOCH.getTime()) / MS_PER_DAY);
}

/** The instant that starts a given simulated day. */
export function fromDayIndex(dayIndex: number): Date {
  return new Date(SIMULATION_EPOCH.getTime() + dayIndex * MS_PER_DAY);
}

/** Maps a day index onto the fictional 12 x 30 calendar. */
export function calendarOf(dayIndex: number): SimulationDateParts {
  const daysPerYear = DAYS_PER_MONTH * MONTHS_PER_YEAR;
  const dayOfYear = ((dayIndex % daysPerYear) + daysPerYear) % daysPerYear;
  const monthIndex = Math.floor(dayOfYear / DAYS_PER_MONTH);
  const startYear = SIMULATION_EPOCH.getUTCFullYear();

  return {
    year: startYear + Math.floor(dayIndex / daysPerYear),
    monthIndex,
    monthName: MONTH_NAMES[monthIndex] ?? MONTH_NAMES[0],
    day: (dayOfYear % DAYS_PER_MONTH) + 1,
    dayIndex,
  };
}

export function formatSimulationDate(dayIndex: number): string {
  const parts = calendarOf(dayIndex);

  return `${pad(parts.day)} ${parts.monthName.toUpperCase()} ${parts.year}`;
}

export function clockOf(dayIndex: number): SimulationClock {
  const parts = calendarOf(dayIndex);

  return {
    ...parts,
    iso: fromDayIndex(dayIndex).toISOString(),
    label: formatSimulationDate(dayIndex),
  };
}

/** Real-time gap between two simulated days at a given speed. */
export function intervalForSpeed(speed: SimulationSpeed): number {
  return Math.max(MIN_TICK_DELAY_MS, Math.round(REAL_MS_PER_SIMULATED_DAY / speed));
}

/**
 * How many whole simulated days have elapsed since the last committed tick.
 * Used on boot to replay the downtime once, and by the scheduler to decide
 * whether a tick is due.
 */
export function elapsedDays(lastTickAt: Date | null, now: Date, speed: SimulationSpeed): number {
  if (!lastTickAt) return 0;

  return Math.max(0, Math.floor((now.getTime() - lastTickAt.getTime()) / intervalForSpeed(speed)));
}

export function nextTickAt(lastTickAt: Date, speed: SimulationSpeed): Date {
  return new Date(lastTickAt.getTime() + intervalForSpeed(speed));
}
