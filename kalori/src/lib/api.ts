/**
 * API client.
 *
 * Every request is same-origin and relative (`/api/...`): in development Vite
 * proxies `/api` to the Express server, and on Vercel the same path is served by
 * the API function. No base URL, no environment variable.
 */
export const API_BASE = '/api';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code = 'REQUEST_FAILED') {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/** Joins a path onto the API base, tolerating a leading slash or its absence. */
export function apiUrl(path: string): string {
  if (path === '' || path === '/') return API_BASE;

  return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
}

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: { code?: string; message?: string };
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 9_000;

/**
 * Performs a request and unwraps the `{ success, data }` envelope.
 * Aborts on timeout so a stalled function cannot pin the UI in a loading state.
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const abort = () => controller.abort();

  options.signal?.addEventListener('abort', abort);

  try {
    const response = await fetch(apiUrl(path), {
      method: options.method ?? 'GET',
      headers: options.body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
      credentials: 'same-origin',
    });

    const payload = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;

    if (!response.ok || !payload?.success) {
      throw new ApiError(
        payload?.error?.message ?? `The server replied with status ${response.status}`,
        response.status,
        payload?.error?.code,
      );
    }

    return payload.data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;

    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiError('The request timed out', 408, 'TIMEOUT');
    }

    throw new ApiError('The simulation API is unreachable', 0, 'NETWORK_ERROR');
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abort);
  }
}

export interface SimulationClock {
  label: string;
  iso: string;
  year: number;
  day: number;
  monthName: string;
  dayIndex: number;
}

export type SimulationStatus = 'running' | 'paused' | 'stopped' | 'degraded';

export interface SimulationSnapshot {
  clock: SimulationClock;
  settings: {
    speed: number;
    paused: boolean;
    autoAdvance: boolean;
    eventFrequency: string;
    checkpointIntervalDays: number;
    difficulty?: string;
    startYear?: number;
  };
  status: SimulationStatus;
  stats: {
    countries: number;
    totalGdp: number;
    averageStability: number;
    averageGrowth: number;
    eventsToday: number;
  };
  lastTickAt: string | null;
  nextTickAt: string | null;
  tickCount: number;
  lastCheckpointDay: number | null;
  lastError: string | null;
  /** Present on the advance endpoint: days still overdue after the batch. */
  remainingDays?: number;
  advancedDays?: number;
}
