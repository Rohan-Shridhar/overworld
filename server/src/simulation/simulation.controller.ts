import type { Request, Response } from 'express';
import { getValidatedBody, getValidatedQuery } from '../middleware/validate-request.js';
import type {
  SimulationAdvanceBody,
  SimulationEventsQuery,
  SimulationSettingsBody,
} from './simulation.schema.js';
import {
  advanceSimulation,
  getSimulationEvents,
  getSimulationSnapshot,
  updateSimulationSettings,
} from './simulation.service.js';
import type { SimulationSettingsPatch } from './simulation.types.js';

/** GET /api/simulation — authoritative clock, settings and world statistics. */
export async function getSimulationHandler(_request: Request, res: Response): Promise<void> {
  const snapshot = await getSimulationSnapshot();

  res.json({ success: true, data: snapshot });
}

/** PATCH /api/simulation — speed, pause, auto-advance, event and checkpoint cadence. */
export async function updateSimulationHandler(_request: Request, res: Response): Promise<void> {
  const body = getValidatedBody<SimulationSettingsBody>(res);
  const snapshot = await updateSimulationSettings(body as SimulationSettingsPatch);

  res.json({ success: true, data: snapshot });
}

/** GET /api/simulation/events — newest simulation events first. */
export async function getSimulationEventsHandler(_request: Request, res: Response): Promise<void> {
  const query = getValidatedQuery<SimulationEventsQuery>(res);
  const events = await getSimulationEvents(query?.limit);

  res.json({ success: true, data: { events } });
}

/**
 * POST /api/simulation/advance — request-driven simulation progression.
 *
 * On Vercel this is the clock: the response reports `remainingDays` so the
 * caller can ask again for the rest of an overdue backlog.
 */
export async function advanceSimulationHandler(_request: Request, res: Response): Promise<void> {
  const body = getValidatedBody<SimulationAdvanceBody>(res);
  const result = await advanceSimulation({ maxDays: body?.maxDays });

  res.json({
    success: true,
    data: {
      ...result.snapshot,
      advancedDays: result.advancedDays,
      remainingDays: result.remainingDays,
      advancedEvents: result.events,
      hitBatchLimit: result.hitBatchLimit,
      hitTimeBudget: result.hitTimeBudget,
    },
  });
}
