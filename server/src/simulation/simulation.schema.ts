import { z } from 'zod';
import { EVENT_FEED_MAX_LIMIT } from './simulation.constants.js';

const SPEEDS: readonly number[] = [0.5, 1, 2, 5, 10];

/**
 * Body for PATCH /api/simulation. Every field is optional so a control can send
 * only what it changes, and at least one field is required so an empty patch
 * cannot silently succeed.
 */
export const simulationSettingsSchema = z
  .object({
    speed: z
      .number()
      .refine((value) => SPEEDS.includes(value), 'speed must be 0.5, 1, 2, 5 or 10')
      .optional(),
    paused: z.boolean().optional(),
    autoAdvance: z.boolean().optional(),
    eventFrequency: z.enum(['low', 'normal', 'high']).optional(),
    checkpointIntervalDays: z.number().int().min(1).max(30).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'Provide at least one setting' });

export type SimulationSettingsBody = z.infer<typeof simulationSettingsSchema>;

export const simulationEventsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(EVENT_FEED_MAX_LIMIT).optional(),
});

export type SimulationEventsQuery = z.infer<typeof simulationEventsQuerySchema>;
