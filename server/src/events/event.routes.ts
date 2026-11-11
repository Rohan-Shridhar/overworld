import { Router } from 'express';
import { toDayIndex } from '../simulation/simulation.clock.js';
import { ensureDefaultWorld } from '../world/world.service.js';
import { AppError } from '../utils/app-error.js';
import { asyncHandler } from '../utils/async-handler.js';
import { getEvent, intelligenceOverview, listEvents, type EventFilter } from './event.service.js';
import { createSnapshot, listSnapshots, restoreSnapshot } from './snapshot.service.js';

const IMPORTANCE = ['low', 'medium', 'high', 'critical'] as const;

function toNumber(value: unknown): number | undefined {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : undefined;
}

function readFilter(query: Record<string, unknown>): EventFilter {
  const importance = typeof query.importance === 'string' ? query.importance : undefined;

  if (importance && !IMPORTANCE.includes(importance as never)) {
    throw AppError.badRequest('importance must be low, medium, high or critical');
  }

  return {
    country: typeof query.country === 'string' ? query.country : undefined,
    region: typeof query.region === 'string' ? query.region : undefined,
    category: typeof query.category === 'string' ? query.category : undefined,
    importance: importance as EventFilter['importance'],
    fromDay: toNumber(query.fromDay),
    toDay: toNumber(query.toDay),
    search: typeof query.search === 'string' ? query.search : undefined,
    limit: toNumber(query.limit),
  };
}

export const eventRouter = Router();

eventRouter.get(
  '/',
  asyncHandler(async (request, res) => {
    const world = await ensureDefaultWorld();
    const filter = readFilter(request.query as Record<string, unknown>);
    const order = request.query.order === 'asc' ? 'asc' : 'desc';
    const events = await listEvents(world._id, filter, order);

    res.json({ success: true, data: { events, filter, order } });
  }),
);

eventRouter.get(
  '/intelligence',
  asyncHandler(async (request, res) => {
    const world = await ensureDefaultWorld();
    const toDay = toDayIndex(new Date(world.currentSimulationDate));
    const windowDays = toNumber(request.query.days) ?? 30;
    const overview = await intelligenceOverview(world._id, Math.max(0, toDay - windowDays), toDay);

    res.json({ success: true, data: overview });
  }),
);

eventRouter.get(
  '/:id',
  asyncHandler(async (request, res) => {
    const world = await ensureDefaultWorld();
    const event = await getEvent(world._id, request.params.id as string);

    res.json({ success: true, data: { event } });
  }),
);

export const snapshotRouter = Router();

snapshotRouter.get(
  '/',
  asyncHandler(async (_request, res) => {
    const world = await ensureDefaultWorld();

    res.json({ success: true, data: { snapshots: await listSnapshots(world._id) } });
  }),
);

snapshotRouter.post(
  '/',
  asyncHandler(async (request, res) => {
    const world = await ensureDefaultWorld();
    const label = typeof request.body?.label === 'string' ? request.body.label : '';
    const snapshot = await createSnapshot(world._id, label);

    res.status(201).json({ success: true, data: { snapshot: { id: String(snapshot._id), label: snapshot.label, day: snapshot.day } } });
  }),
);

snapshotRouter.post(
  '/:id/restore',
  asyncHandler(async (request, res) => {
    const world = await ensureDefaultWorld();
    const result = await restoreSnapshot(world._id, request.params.id as string);

    res.json({ success: true, data: result });
  }),
);
