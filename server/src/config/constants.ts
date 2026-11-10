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
