import { logger } from '../lib/logger.js';
import {
  MIN_TICK_DELAY_MS,
  type SimulationSpeed,
} from './simulation.constants.js';
import { intervalForSpeed } from './simulation.clock.js';

export interface TickSchedulerOptions {
  /** Current speed, read on every scheduling decision so changes apply at once. */
  getSpeed: () => SimulationSpeed;
  /** Whether the clock is allowed to advance at all. */
  isPaused: () => boolean;
  /** The tick body. The scheduler catches and reports any rejection. */
  onTick: () => Promise<void>;
  onError?: (error: Error) => void;
  /** Injectable clock and timer so tests never wait on real time. */
  now?: () => number;
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
}

/**
 * Self-rescheduling tick loop.
 *
 * A fixed interval cannot express the speed control, because the cadence
 * changes while the world is running, and `node-cron` can only express
 * whole-minute wall-clock schedules. One timer that re-arms itself with the
 * current speed is both simpler and exact for 6s..120s cadences.
 *
 * Ticks never overlap: a tick is awaited before the next timer is armed, and
 * `triggerNow` refuses to start while another tick is in flight.
 */
export class TickScheduler {
  private timer: ReturnType<typeof setTimeout> | null = null;

  private running = false;

  private ticking = false;

  private readonly now: () => number;

  private readonly setTimer: typeof setTimeout;

  private readonly clearTimer: typeof clearTimeout;

  constructor(private readonly settings: TickSchedulerOptions) {
    this.now = settings.now ?? Date.now;
    this.setTimer = settings.setTimeoutFn ?? setTimeout;
    this.clearTimer = settings.clearTimeoutFn ?? clearTimeout;
  }

  get isStarted(): boolean {
    return this.running;
  }

  get isTicking(): boolean {
    return this.ticking;
  }

  start(): void {
    if (this.running) return;

    this.running = true;
    this.arm(this.settings.isPaused() ? this.pollDelay() : this.tickDelay());
  }

  stop(): void {
    this.running = false;

    if (this.timer) {
      this.clearTimer(this.timer);
      this.timer = null;
    }
  }

  /** Runs a tick immediately, keeping the no-overlap guarantee. */
  async triggerNow(): Promise<boolean> {
    if (this.ticking) {
      logger.debug('Simulation tick skipped: previous tick still running');
      return false;
    }

    this.ticking = true;

    try {
      await this.settings.onTick();
      return true;
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error));
      logger.error('Simulation tick failed', { error });
      this.settings.onError?.(failure);
      return false;
    } finally {
      this.ticking = false;
    }
  }

  private tickDelay(): number {
    return intervalForSpeed(this.settings.getSpeed());
  }

  /** While paused the loop keeps a slow poll so a resume is picked up promptly. */
  private pollDelay(): number {
    return Math.max(1_000, this.tickDelay());
  }

  private arm(delay: number): void {
    if (!this.running) return;

    this.timer = this.setTimer(() => {
      this.timer = null;
      void this.runAndRearm();
    }, delay);

    // Never hold the process open just to wait for the next simulated day.
    this.timer.unref?.();
  }

  private async runAndRearm(): Promise<void> {
    const startedAt = this.now();

    if (!this.settings.isPaused()) {
      await this.triggerNow();
    }

    if (!this.running) return;

    if (this.settings.isPaused()) {
      this.arm(this.pollDelay());
      return;
    }

    const spent = this.now() - startedAt;
    this.arm(Math.max(MIN_TICK_DELAY_MS, this.tickDelay() - spent));
  }
}
