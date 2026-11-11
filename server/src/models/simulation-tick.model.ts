import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * Ledger of committed simulation days.
 *
 * The unique (worldId, day) index is the duplicate-tick guard: a tick claims its
 * day by inserting here, and a replay of the same day finds the claim already
 * taken and stops. It doubles as the recovery record after a restart.
 */
const simulationTickSchema = new Schema(
  {
    worldId: { type: Schema.Types.ObjectId, ref: 'World', required: true, index: true },
    day: { type: Number, required: true, min: 0 },
    committedAt: { type: Date, required: true, default: () => new Date() },
    durationMs: { type: Number, default: 0, min: 0 },
    tickCount: { type: Number, default: 0, min: 0 },
  },
  { versionKey: false, collection: 'simulation_ticks' },
);

simulationTickSchema.index({ worldId: 1, day: 1 }, { unique: true });

export type SimulationTick = InferSchemaType<typeof simulationTickSchema>;

export const SimulationTickModel = model<SimulationTick>('SimulationTick', simulationTickSchema);
