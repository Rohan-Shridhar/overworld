import { z } from 'zod';

/** Allowed query parameters for `GET /api/health`. */
export const healthQuerySchema = z.object({
  detail: z.enum(['summary', 'full']).default('summary'),
});

export type HealthQuery = z.infer<typeof healthQuerySchema>;
