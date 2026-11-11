/**
 * Local development configuration.
 *
 * These values are deliberately constants rather than environment variables.
 * `MONGODB_URI` is the only application environment variable this project uses,
 * so every other knob lives here where it is version controlled and reviewable.
 */
export const APP_NAME = 'Geopolitical Sandbox' as const;

/** Keep in sync with the `version` field in server/package.json. */
export const APP_VERSION = '0.1.0' as const;

/** Prefix every HTTP API route is mounted under. */
export const API_PREFIX = '/api' as const;

/** Port the Express server listens on in local development. */
export const SERVER_PORT = 5000 as const;

/** Interface the server binds to. Wide binding keeps containers and LAN devices working. */
export const SERVER_HOST = '0.0.0.0' as const;

/** Path Socket.IO is mounted on. The Vite dev proxy forwards this to the API server. */
export const SOCKET_PATH = '/socket.io' as const;

/** Origins allowed to call the API and open websockets in local development. */
export const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
] as const;

/** How long Mongoose waits for a MongoDB Atlas node before giving up on a single attempt. */
export const DB_SERVER_SELECTION_TIMEOUT_MS = 5_000;

/** Total connection attempts made at boot before the API starts in a degraded state. */
export const DB_CONNECT_MAX_ATTEMPTS = 3;

/** Delay between connection attempts. */
export const DB_CONNECT_RETRY_DELAY_MS = 2_000;

/** Upper bound for a query issued by the health check. */
export const DB_HEALTH_QUERY_TIMEOUT_MS = 2_000;

/** Maximum time allowed for a graceful shutdown before the process is forced down. */
export const SHUTDOWN_TIMEOUT_MS = 10_000;

/** Maximum accepted JSON request body size. */
export const REQUEST_BODY_LIMIT = '1mb' as const;

/** Socket.IO heartbeat cadence, in milliseconds. */
export const SOCKET_PING_INTERVAL_MS = 25_000;

export const SOCKET_PING_TIMEOUT_MS = 20_000;

export const isProduction = (): boolean => process.env.NODE_ENV === 'production';

export const isTest = (): boolean => process.env.NODE_ENV === 'test';

/**
 * True when running inside a Vercel Function.
 *
 * `VERCEL` is injected by the platform, not configured by this application, so
 * `MONGODB_URI` remains the only variable an operator has to set.
 */
export const isServerlessRuntime = (): boolean => process.env.VERCEL === '1';

/** Hosts (beyond localhost) whose browser origin may call the API. */
export const ALLOWED_ORIGIN_SUFFIXES = ['.vercel.app'] as const;

/**
 * Request origin allow-list.
 *
 * A missing origin is allowed: same-origin GETs, server-to-server calls and
 * curl send none. Localhost stays available for development, and the project's
 * own `*.vercel.app` deployments (production and previews) are allowed so the
 * static frontend can call its own origin without a wildcard.
 */
export function isAllowedOrigin(origin?: string | null): boolean {
  if (!origin) return true;

  if (ALLOWED_ORIGINS.some((allowed) => allowed === origin)) return true;

  try {
    const url = new URL(origin);

    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;

    return ALLOWED_ORIGIN_SUFFIXES.some(
      (suffix) => url.hostname === suffix.slice(1) || url.hostname.endsWith(suffix),
    );
  } catch {
    return false;
  }
}

/**
 * Days committed by one serverless invocation.
 *
 * Vercel Hobby caps a function at 10 seconds, so a single request processes a
 * small batch and leaves the rest overdue. The backlog is never discarded:
 * `simulationState.lastTickAt` only advances by the days actually committed.
 */
export const SERVERLESS_MAX_DAYS_PER_REQUEST = 12 as const;

/** Wall-clock budget for the advancement pass, leaving room to serialise a response. */
export const SERVERLESS_TIME_BUDGET_MS = 6_500 as const;

/** Atlas selection timeout used inside a function, where a slow query is fatal. */
export const DB_SERVERLESS_SELECTION_TIMEOUT_MS = 8_000 as const;

/** One attempt per invocation: a retry loop cannot fit inside a function budget. */
export const DB_SERVERLESS_MAX_ATTEMPTS = 1 as const;

/** How long Mongoose buffers an operation while the socket is still connecting. */
export const DB_BUFFER_TIMEOUT_MS = 5_000 as const;

