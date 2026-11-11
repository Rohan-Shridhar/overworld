import { getSocketServer, SOCKET_EVENTS } from '../config/socket.js';
import { logger } from '../lib/logger.js';
import type { SimulationEventView, SimulationSnapshot } from './simulation.types.js';

/**
 * Event dispatcher. Socket.IO is the only transport: when no server is attached
 * (tests, CLI work) the broadcast is a no-op rather than an error.
 */
function broadcast(event: string, payload: unknown): void {
  const server = getSocketServer();

  if (!server) return;

  try {
    server.emit(event, payload);
  } catch (error) {
    logger.warn('Simulation broadcast failed', { event, error });
  }
}

export function broadcastSimulationTick(snapshot: SimulationSnapshot): void {
  broadcast(SOCKET_EVENTS.SIMULATION_TICK, snapshot);
}

export function broadcastSimulationState(snapshot: SimulationSnapshot): void {
  broadcast(SOCKET_EVENTS.SIMULATION_STATE, snapshot);
}

export function broadcastSimulationEvent(event: SimulationEventView): void {
  broadcast(SOCKET_EVENTS.SIMULATION_EVENT, event);
}

export function broadcastSimulationEvents(events: SimulationEventView[]): void {
  events.forEach(broadcastSimulationEvent);
}
