import type { Request, Response } from 'express';
import { getValidatedBody, getValidatedQuery } from '../middleware/validate-request.js';
import type { SimulationEventsQuery, SimulationSettingsBody } from './simulation.schema.js';
import {
  getSimulationEvents,
  getSimulationSnapshot,
  updateSimulationSettings,
} from './simulation.service.js';

/** GET /api/simulation — authoritative clock, settings and world statistics. */
export async function getSimulationHandler(_request: Request, res: Response): Promise<void> {
  const snapshot = await getSimulationSnapshot();

  res.json({ success: true, data: snapshot });
}

/** PATCH /api/simulation — speed, pause, auto-advance, event and checkpoint cadence. */
export async function updateSimulationHandler(_request: Request, res: Response): Promise<void> {
  const body = getValidatedBody<SimulationSettingsBody>(res);
  const snapshot = await updateSimulationSettings(body);

  res.json({ success: true, data: snapshot });
}

/** GET /api/simulation/events — newest simulation events first. */
export async function getSimulationEventsHandler(_request: Request, res: Response): Promise<void> {
  const query = getValidatedQuery<SimulationEventsQuery>(res);
  const events = await getSimulationEvents(query?.limit);

  res.json({ success: true, data: { events } });
}
