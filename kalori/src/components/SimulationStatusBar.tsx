import { useSimulationState } from '../hooks/useSimulationState'
import './SimulationStatusBar.css'

/**
 * World clock readout.
 *
 * Deliberately additive: it reports the persisted simulation state and leaves
 * the page's existing markup and layout untouched. It is also the UI's liveness
 * probe — if the API or Atlas is down, the failure is visible instead of silent.
 */
export function SimulationStatusBar() {
  const { snapshot, error, loading } = useSimulationState()

  if (loading) {
    return (
      <div className="world-bar" role="status" aria-live="polite">
        <span className="world-bar__dot" data-state="pending" />
        <span className="world-bar__label">Reading world clock</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="world-bar" role="alert">
        <span className="world-bar__dot" data-state="error" />
        <span className="world-bar__label">Simulation unavailable</span>
        <span className="world-bar__detail">{error}</span>
      </div>
    )
  }

  if (!snapshot) return null

  const { clock, settings, status, stats, lastError } = snapshot

  return (
    <div className="world-bar" role="status" aria-live="polite">
      <span className="world-bar__dot" data-state={status} />
      <span className="world-bar__label">{clock.label}</span>
      <span className="world-bar__divider" aria-hidden="true" />
      <span className="world-bar__detail">{status}</span>
      <span className="world-bar__divider" aria-hidden="true" />
      <span className="world-bar__detail">{settings.speed}× speed</span>
      <span className="world-bar__divider" aria-hidden="true" />
      <span className="world-bar__detail">
        {stats.countries} states · {snapshot.tickCount} ticks
      </span>
      {lastError ? <span className="world-bar__detail world-bar__detail--warn">{lastError}</span> : null}
    </div>
  )
}
