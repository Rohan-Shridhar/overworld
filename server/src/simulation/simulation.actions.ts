import type { Types } from 'mongoose';
import { CountryModel } from '../models/country.model.js';
import { ScheduledActionModel } from '../models/scheduled-action.model.js';
import { MAX_ACTIONS_PER_TICK } from './simulation.constants.js';

export interface ScheduledActionInput {
  worldId: Types.ObjectId;
  dueDay: number;
  type: string;
  payload: Record<string, unknown>;
}

export async function enqueueScheduledAction(input: ScheduledActionInput): Promise<void> {
  await ScheduledActionModel.create({
    worldId: input.worldId,
    dueDay: input.dueDay,
    type: input.type,
    payload: input.payload,
    status: 'pending',
  });
}

/** Prevents the same review being queued on every unstable day. */
export async function hasPendingAction(
  worldId: Types.ObjectId,
  type: string,
  countryCode: string,
): Promise<boolean> {
  const existing = await ScheduledActionModel.exists({
    worldId,
    type,
    status: 'pending',
    'payload.countryCode': countryCode,
  });

  return Boolean(existing);
}

type ActionHandler = (action: {
  worldId: Types.ObjectId;
  payload: Record<string, unknown>;
  dueDay: number;
}) => Promise<string>;

const HANDLERS: Record<string, ActionHandler> = {
  /** Files a stability review into the country's own history. */
  'country.review': async ({ payload }) => {
    const countryCode = String(payload.countryCode ?? '');
    const stability = Number(payload.stability ?? 0);
    const countryName = String(payload.countryName ?? countryCode);

    if (!countryCode) return 'review skipped: no country';

    await CountryModel.updateOne(
      { shortCode: countryCode },
      {
        $push: {
          history: {
            at: new Date(),
            title: `Stability review: ${countryName}`,
            detail: `Political stability stood at ${stability.toFixed(1)}/100 when the review was filed.`,
            kind: 'government',
          },
        },
      },
    );

    return `review filed for ${countryCode}`;
  },
  /** Acknowledged so queued reports are never stuck in the pending state. */
  'world.report': async ({ dueDay }) => `report acknowledged for day ${dueDay}`,
};

export interface ActionDrainResult {
  processed: number;
  notes: string[];
}

/**
 * Drains every action that is due on or before the simulated day. Handlers are
 * idempotent from the caller's perspective: an action is marked completed in the
 * same pass that runs it.
 */
export async function drainScheduledActions(
  worldId: Types.ObjectId,
  day: number,
): Promise<ActionDrainResult> {
  const due = await ScheduledActionModel.find({
    worldId,
    status: 'pending',
    dueDay: { $lte: day },
  })
    .sort({ dueDay: 1 })
    .limit(MAX_ACTIONS_PER_TICK)
    .lean();

  const notes: string[] = [];
  let processed = 0;

  for (const action of due) {
    const handler = HANDLERS[action.type];

    if (!handler) {
      await ScheduledActionModel.updateOne(
        { _id: action._id },
        { $set: { status: 'cancelled', completedAt: new Date(), result: 'no handler' } },
      );
      continue;
    }

    try {
      const note = await handler({
        worldId,
        payload: (action.payload ?? {}) as Record<string, unknown>,
        dueDay: action.dueDay,
      });

      await ScheduledActionModel.updateOne(
        { _id: action._id },
        { $set: { status: 'completed', completedAt: new Date(), result: note } },
      );

      notes.push(note);
      processed += 1;
    } catch {
      // Left pending on purpose: the next tick retries it.
      notes.push(`action ${action.type} failed`);
    }
  }

  return { processed, notes };
}
