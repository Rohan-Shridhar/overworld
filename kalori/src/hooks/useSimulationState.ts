import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, apiRequest, type SimulationSnapshot } from '../lib/api';

/**
 * Production polling interval.
 *
 * On Vercel there is no WebSocket that can be trusted across function
 * instances, so the clock is refreshed over HTTP. Reads are cheap: the endpoint
 * returns the persisted snapshot (`simulationState.lastStats`) rather than
 * re-aggregating every country.
 */
const DEFAULT_POLL_INTERVAL_MS = 5_000;

export interface SimulationStateResult {
  snapshot: SimulationSnapshot | null;
  error: string | null;
  loading: boolean;
  refresh: () => void;
}

/**
 * Polls the simulation snapshot.
 *
 * - A ref guards against overlapping requests, so a slow reply cannot stack up.
 * - The interval is cleared on unmount and polling pauses while the tab is hidden.
 * - Socket.IO, when available in local development, is an optimisation only:
 *   the HTTP snapshot stays the source of truth.
 */
export function useSimulationState(pollIntervalMs: number = DEFAULT_POLL_INTERVAL_MS): SimulationStateResult {
  const [snapshot, setSnapshot] = useState<SimulationSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const inFlight = useRef(false);
  const mounted = useRef(false);

  const load = useCallback(async () => {
    if (inFlight.current) return;

    inFlight.current = true;

    try {
      const data = await apiRequest<SimulationSnapshot>('/simulation');
      if (!mounted.current) return;

      setSnapshot(data);
      setError(null);
    } catch (caught) {
      if (!mounted.current) return;

      setError(caught instanceof ApiError ? caught.message : 'The simulation state could not be loaded');
    } finally {
      inFlight.current = false;
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void load();

    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, pollIntervalMs);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void load();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      mounted.current = false;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [load, pollIntervalMs]);

  const refresh = useCallback(() => {
    void load();
  }, [load]);

  return { snapshot, error, loading, refresh };
}
