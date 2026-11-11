import type { Types } from 'mongoose';
import { logger } from '../lib/logger.js';
import { WorldModel } from '../models/world.model.js';
import { createRandom } from '../world/generator/seeded-random.js';
import { ensureDefaultWorld } from '../world/world.service.js';
import {
  drainScheduledActions,
  enqueueScheduledAction,
  hasPendingAction,
} from './simulation.actions.js';
import { clockOf, elapsedDays, nextTickAt, toDayIndex } from './simulation.clock.js';
import {
  DEFAULT_AUTO_ADVANCE,
  DEFAULT_CHECKPOINT_INTERVAL_DAYS,
  DEFAULT_EVENT_FREQUENCY,
  DEFAULT_PAUSED,
  DEFAULT_SPEED,
  EVENT_FREQUENCY_CHANCE,
  MAX_CATCH_UP_DAYS,
  STABILITY_REVIEW_THRESHOLD,
  SUPPORTED_SPEEDS,
  type EventFrequency,
  type SimulationSpeed,
} from './simulation.constants.js';
import {
  broadcastSimulationEvents,
  broadcastSimulationState,
  broadcastSimulationTick,
} from './simulation.events.js';
import {
  applyEventEffect,
  claimTick,
  loadCountrySnapshots,
  loadRecentEvents,
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
import { TickScheduler } from './simulation.scheduler.js';
import type {
  CountryDayState,
  CountryDayUpdate,
  GeneratedEvent,
  SimulationSettings,
  SimulationSettingsPatch,
  SimulationSnapshot,
  SimulationStats,
  SimulationStatus,
  TickOutcome,
} from './simulation.types.js';

export interface WorldSettingsSource {
  speed?: unknown;
  paused?: boolean;
  autoAdvance?: boolean;
  eventFrequency?: string;
  checkpointIntervalDays?: number;
  difficulty?: string;
  startYear?: number;
}

const DEFAULT_SETTINGS: SimulationSettings = {
  speed: DEFAULT_SPEED,
  paused: DEFAULT_PAUSED,
  autoAdvance: DEFAULT_AUTO_ADVANCE,
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

/** Legacy rows stored `speed: "paused"`; anything unrecognised falls back to 1x. */
export function normaliseSpeed(value: unknown): SimulationSpeed {
  const parsed = typeof value === 'number' ? value : Number(value);

  return SUPPORTED_SPEEDS.find((speed) => speed === parsed) ?? DEFAULT_SPEED;
}

const EVENT_FREQUENCIES: ReadonlyArray<EventFrequency> = ['low', 'normal', 'high'];

function normaliseFrequency(value: unknown): EventFrequency {
  return EVENT_FREQUENCIES.find((frequency) => frequency === value) ?? DEFAULT_EVENT_FREQUENCY;
}

export function settingsFromWorld(raw: WorldSettingsSource | undefined): SimulationSettings {
  return {
    speed: normaliseSpeed(raw?.speed),
    paused: raw?.paused ?? DEFAULT_PAUSED,
    autoAdvance: raw?.autoAdvance ?? DEFAULT_AUTO_ADVANCE,
    eventFrequency: normaliseFrequency(raw?.eventFrequency),
    checkpointIntervalDays:
      raw?.checkpointIntervalDays ?? DEFAULT_CHECKPOINT_INTERVAL_DAYS,
    difficulty: raw?.difficulty ?? DEFAULT_SETTINGS.difficulty,
    startYear: raw?.startYear ?? DEFAULT_SETTINGS.startYear,
  };
}

export interface EngineOptions {
  /** Replaced in tests so the engine never touches a socket. */
  broadcastTick?: typeof broadcastSimulationTick;
  broadcastState?: typeof broadcastSimulationState;
  broadcastEvents?: typeof broadcastSimulationEvents;
  now?: () => Date;
}

type TickTrigger = 'scheduled' | 'catch-up' | 'manual';

/**
 * The simulation engine.
 *
 * It owns simulated time. Controllers and React components read snapshots and
 * send settings; they never advance the clock themselves.
 */
export class SimulationEngine {
  private settings: SimulationSettings = { ...DEFAULT_SETTINGS };

  private worldId: Types.ObjectId | null = null;

  private day = 0;

  private lastTickAt: Date | null = null;

  private lastCheckpointDay: number | null = null;

  private tickCount = 0;

  private stats: SimulationStats = { ...EMPTY_STATS };

  private lastError: string | null = null;

  private replayedDays = 0;

  private running = false;

  private inFlight = false;

  private lastOutcome: TickOutcome | null = null;

  private readonly options: EngineOptions;

  private readonly scheduler: TickScheduler;

  constructor(options: EngineOptions = {}) {
    this.options = options;
    this.scheduler = new TickScheduler({
      getSpeed: () => this.settings.speed,
      isPaused: () => this.isPaused,
      onTick: () => this.runTick('scheduled').then(() => undefined),
      onError: (error) => {
        this.lastError = error.message;
      },
      now: () => this.now().getTime(),
    });
  }

  get isRunning(): boolean {
    return this.running;
  }

  get currentDay(): number {
    return this.day;
  }

  get isPaused(): boolean {
    return this.settings.paused || !this.settings.autoAdvance;
  }

  /**
   * Restores settings and clock from MongoDB, replays the downtime, then arms
   * the tick loop. Idempotent: a second call returns the current snapshot.
   */
  async start(): Promise<SimulationSnapshot> {
    if (this.running) return this.snapshot();

    const world = await ensureDefaultWorld();

    this.worldId = world._id as Types.ObjectId;
    this.settings = settingsFromWorld(world.simulationSettings as WorldSettingsSource | undefined);
    this.day = toDayIndex(new Date(world.currentSimulationDate));
    this.lastTickAt = world.simulationState?.lastTickAt ?? null;
    this.tickCount = world.simulationState?.tickCount ?? 0;
    this.lastCheckpointDay = world.simulationState?.lastCheckpointDay ?? null;
    this.lastError = null;
    this.running = true;

    this.replayedDays = await this.catchUp();
    this.scheduler.start();

    const snapshot = this.snapshot();
    this.emitState(snapshot);

    logger.info('Simulation engine started', {
      day: this.day,
      date: snapshot.clock.label,
      speed: this.settings.speed,
      paused: this.isPaused,
      replayedDays: this.replayedDays,
      tickCount: this.tickCount,
    });

    return snapshot;
  }

  stop(): void {
    this.running = false;
    this.scheduler.stop();
  }

  /** Reads the authoritative snapshot. Never mutates anything. */
  snapshot(): SimulationSnapshot {
    const paused = this.isPaused;
    const status: SimulationStatus = !this.running
      ? 'stopped'
      : paused
        ? 'paused'
        : this.lastError
          ? 'degraded'
          : 'running';

    return {
      clock: clockOf(this.day),
      settings: { ...this.settings },
      status,
      stats: { ...this.stats },
      lastTickAt: this.lastTickAt?.toISOString() ?? null,
      nextTickAt:
        !paused && this.lastTickAt
          ? nextTickAt(this.lastTickAt, this.settings.speed).toISOString()
          : null,
      tickCount: this.tickCount,
      lastCheckpointDay: this.lastCheckpointDay,
      lastError: this.lastError,
    };
  }

  /** Applies settings to memory and MongoDB, then re-arms the timer. */
  async updateSettings(patch: SimulationSettingsPatch): Promise<SimulationSnapshot> {
    if (!this.worldId) {
      throw new Error('The simulation engine is not ready yet');
    }

    const next: SimulationSettings = { ...this.settings };

    if (patch.speed !== undefined) next.speed = normaliseSpeed(patch.speed);
    if (patch.paused !== undefined) next.paused = patch.paused;
    if (patch.autoAdvance !== undefined) next.autoAdvance = patch.autoAdvance;
    if (patch.eventFrequency !== undefined) next.eventFrequency = normaliseFrequency(patch.eventFrequency);
    if (patch.checkpointIntervalDays !== undefined) {
      next.checkpointIntervalDays = Math.min(30, Math.max(1, Math.round(patch.checkpointIntervalDays)));
    }

    this.settings = next;
    this.lastError = null;

    await WorldModel.updateOne(
      { _id: this.worldId },
      {
        $set: {
          'simulationSettings.speed': next.speed,
          'simulationSettings.paused': next.paused,
          'simulationSettings.autoAdvance': next.autoAdvance,
          'simulationSettings.eventFrequency': next.eventFrequency,
          'simulationSettings.checkpointIntervalDays': next.checkpointIntervalDays,
        },
      },
    );

    // The cadence depends on speed, so the pending timer is replaced.
    if (this.running) {
      this.scheduler.stop();
      this.scheduler.start();
    }

    const snapshot = this.snapshot();
    this.emitState(snapshot);

    logger.info('Simulation settings updated', {
      speed: next.speed,
      paused: next.paused,
      autoAdvance: next.autoAdvance,
      status: snapshot.status,
    });

    return snapshot;
  }

  async listEvents(limit: number): Promise<Awaited<ReturnType<typeof loadRecentEvents>>> {
    if (!this.worldId) await this.start();

    if (!this.worldId) return [];

    return loadRecentEvents(this.worldId, limit);
  }

  /** Advances exactly one simulated day. Used by tests and manual tooling. */
  async tickNow(): Promise<TickOutcome> {
    await this.scheduler.triggerNow();

    return (
      this.lastOutcome ?? {
        day: this.day,
        processed: false,
        advanced: false,
        events: [],
        checkpointWritten: false,
        durationMs: 0,
        reason: 'busy',
      }
    );
  }

  /** Test helper: forgets runtime state so a fresh engine can be built. */
  reset(): void {
    this.stop();
    this.worldId = null;
    this.day = 0;
    this.lastTickAt = null;
    this.lastCheckpointDay = null;
    this.tickCount = 0;
    this.stats = { ...EMPTY_STATS };
    this.lastError = null;
    this.replayedDays = 0;
    this.lastOutcome = null;
    this.settings = { ...DEFAULT_SETTINGS };
    this.inFlight = false;
  }

  private now(): Date {
    return this.options.now?.() ?? new Date();
  }

  /**
   * Replays the days that elapsed while the API was down. Bounded so a long
   * outage cannot stall startup; the clock then resumes from now.
   */
  private async catchUp(): Promise<number> {
    if (this.isPaused) return 0;

    if (!this.lastTickAt) {
      this.lastTickAt = this.now();
      return 0;
    }

    const elapsed = elapsedDays(this.lastTickAt, this.now(), this.settings.speed);
    const replay = Math.min(elapsed, MAX_CATCH_UP_DAYS);
    let replayed = 0;

    for (let index = 0; index < replay; index += 1) {
      if (this.isPaused) break;

      const outcome = await this.runTick('catch-up');
      if (!outcome.advanced) break;

      replayed += 1;
    }

    if (elapsed > replay) {
      logger.warn('Skipped simulated days beyond the catch-up bound', {
        elapsed,
        replayed,
        bound: MAX_CATCH_UP_DAYS,
      });
      this.lastTickAt = this.now();
    }

    return replayed;
  }

  /** One simulated day. Claims the day before writing anything. */
  private async runTick(trigger: TickTrigger): Promise<TickOutcome> {
    const startedAt = Date.now();

    if (!this.worldId) {
      return this.recordOutcome({
        day: this.day,
        processed: false,
        advanced: false,
        events: [],
        checkpointWritten: false,
        durationMs: 0,
        reason: 'not-ready',
      });
    }

    if (this.inFlight) {
      return this.recordOutcome({
        day: this.day,
        processed: false,
        advanced: false,
        events: [],
        checkpointWritten: false,
        durationMs: 0,
        reason: 'busy',
      });
    }

    this.inFlight = true;
    const worldId = this.worldId;
    const day = this.day + 1;
    const settings = this.settings;
    let claimed = false;

    try {
      claimed = await claimTick(worldId, day, this.tickCount + 1);

      if (!claimed) {
        // Another worker (or a replay) already committed this day.
        this.day = day;
        this.lastTickAt = this.now();
        logger.debug('Simulation day already committed; skipping', { day, trigger });

        return this.recordOutcome({
          day,
          processed: false,
          advanced: false,
          events: [],
          checkpointWritten: false,
          durationMs: Date.now() - startedAt,
          reason: 'duplicate',
        });
      }

      const countries = await loadCountrySnapshots(worldId);

      if (countries.length === 0) {
        throw new Error('The world has no countries to simulate');
      }

      const updates = countries.map((country) =>
        simulateCountryDay(
          country,
          createRandom(`${this.seedKey(worldId)}:${day}:${country.code}`),
        ),
      );

      const generated = this.generateForDay(day, countries, updates, {
        eventFrequency: settings.eventFrequency,
      });

      const stats = this.computeStats(updates, generated);
      const lastTickAt = this.now();
      const checkpointDue =
        this.lastCheckpointDay === null
          ? false
          : day - this.lastCheckpointDay >= settings.checkpointIntervalDays;
      const checkpointDay = checkpointDue ? day : null;

      await persistTick({
        worldId,
        day,
        settings,
        updates,
        lastTickAt,
        lastCheckpointDay: checkpointDay,
        durationMs: Date.now() - startedAt,
      });

      const events = await recordEvents(worldId, day, generated);

      if (checkpointDay !== null) {
        await saveCheckpoint(worldId, day, this.tickCount + 1, stats);
        this.lastCheckpointDay = checkpointDay;
      }

      await drainScheduledActions(worldId, day);
      await this.queueStabilityReviews(worldId, countries, updates, day);

      this.day = day;
      this.lastTickAt = lastTickAt;
      this.tickCount += 1;
      this.stats = stats;
      this.lastError = null;

      const snapshot = this.snapshot();
      this.emitTick(snapshot);
      this.emitEvents(events);

      return this.recordOutcome({
        day,
        processed: true,
        advanced: true,
        events,
        checkpointWritten: checkpointDay !== null,
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      if (claimed) {
        await releaseTick(worldId, day).catch(() => undefined);
      }

      const message = error instanceof Error ? error.message : String(error);
      this.lastError = message;
      this.emitState(this.snapshot());
      logger.error('Simulation tick failed', { day, trigger, error });

      throw error;
    } finally {
      this.inFlight = false;
    }
  }

  private generateForDay(
    day: number,
    countries: CountryDayState[],
    updates: CountryDayUpdate[],
    options: { eventFrequency: EventFrequency },
  ): GeneratedEvent[] {
    const random = createRandom(`${this.seedKey(this.worldId)}:${day}:events`);
    const chance = EVENT_FREQUENCY_CHANCE[options.eventFrequency];

    if (!shouldGenerateEvent(random, chance)) return [];

    const country = pickEventCountry(countries, random);
    if (!country) return [];

    const event = generateWorldEvent(country, random);
    const index = updates.findIndex((update) => update.code === country.code);
    const target = index >= 0 ? updates[index] : undefined;

    if (target) {
      const adjusted = applyEventEffect(target, event);
      updates[index] = adjusted;
    }

    return [event];
  }

  private seedKey(worldId: Types.ObjectId | null): string {
    return `sim:${String(worldId)}`;
  }

  private computeStats(updates: CountryDayUpdate[], events: GeneratedEvent[]): SimulationStats {
    const aggregate = aggregateStats(
      updates.map((update) => ({
        gdp: update.gdp,
        stability: update.stability,
        gdpGrowth: update.economy.gdpGrowth,
      })),
    );

    return { ...aggregate, eventsToday: events.length };
  }

  private async queueStabilityReviews(
    worldId: Types.ObjectId,
    countries: CountryDayState[],
    updates: CountryDayUpdate[],
    day: number,
  ): Promise<void> {
    for (const update of updates) {
      if (update.stability > STABILITY_REVIEW_THRESHOLD) continue;

      const country = countries.find((entry) => entry.code === update.code);
      if (!country) continue;

      const pending = await hasPendingAction(worldId, 'country.review', update.code);
      if (pending) continue;

      await enqueueScheduledAction({
        worldId,
        dueDay: day + 1,
        type: 'country.review',
        payload: {
          countryCode: update.code,
          countryName: country.name,
          stability: update.stability,
        },
      });
    }
  }

  private recordOutcome(outcome: TickOutcome): TickOutcome {
    this.lastOutcome = outcome;

    return outcome;
  }

  private emitTick(snapshot: SimulationSnapshot): void {
    (this.options.broadcastTick ?? broadcastSimulationTick)(snapshot);
  }

  private emitState(snapshot: SimulationSnapshot): void {
    (this.options.broadcastState ?? broadcastSimulationState)(snapshot);
  }

  private emitEvents(events: Parameters<typeof broadcastSimulationEvents>[0]): void {
    if (events.length === 0) return;

    (this.options.broadcastEvents ?? broadcastSimulationEvents)(events);
  }
}

/** Process-wide engine. One tick loop per API instance. */
export const simulationEngine = new SimulationEngine();
