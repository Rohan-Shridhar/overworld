import 'dotenv/config';
import { z } from 'zod';

/**
 * The complete application environment.
 *
 * `MONGODB_URI` is the only supported environment variable. Anything else the
 * process needs is a documented constant in `config/constants.ts`.
 */
export const envSchema = z.object({
  MONGODB_URI: z
    .string()
    .trim()
    .min(1, 'MONGODB_URI is required')
    .max(2048, 'MONGODB_URI is too long')
    .refine(
      (value) => /^mongodb(\+srv)?:\/\/.+/.test(value),
      'MONGODB_URI must be a mongodb:// or mongodb+srv:// connection string',
    ),
});

export type Env = z.infer<typeof envSchema>;

export class EnvValidationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`Invalid environment configuration:\n- ${issues.join('\n- ')}`);
    this.name = 'EnvValidationError';
    this.issues = issues;
  }
}

/**
 * Validate environment variables without touching `process.env`.
 * Used directly by tests so the loader can be verified in isolation.
 */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new EnvValidationError(
      result.error.issues.map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`),
    );
  }
  return result.data;
}

let cachedEnv: Env | null = null;

/**
 * Lazily resolved environment. Throws `EnvValidationError` when `MONGODB_URI` is
 * missing or malformed so the fault is reported once, at boot, with a clear message.
 */
export function getEnv(): Env {
  cachedEnv ??= parseEnv(process.env);
  return cachedEnv;
}

/** Test helper: clears the memoised environment. */
export function resetEnvCache(): void {
  cachedEnv = null;
}
