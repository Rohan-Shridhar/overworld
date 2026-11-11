import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * Periodic aggregate snapshot. Cheap to write, enough to prove the world state
 * at a given day and to compare after a restart.
 */
const simulationCheckpointSchema = new Schema(
  {
    worldId: { type: Schema.Types.ObjectId, ref: 'World', required: true, index: true },
    day: { type: Number, required: true, min: 0 },
    simulationDate: { type: Date, required: true },
    tickCount: { type: Number, default: 0, min: 0 },
    stats: {
      countries: { type: Number, default: 0 },
      totalGdp: { type: Number, default: 0 },
      averageStability: { type: Number, default: 0 },
      averageGrowth: { type: Number, default: 0 },
    },
  },
  { versionKey: false, collection: 'simulation_checkpoints' },
);

simulationCheckpointSchema.index({ worldId: 1, day: 1 }, { unique: true });

export type SimulationCheckpoint = InferSchemaType<typeof simulationCheckpointSchema>;

export const SimulationCheckpointModel = model<SimulationCheckpoint>(
  'SimulationCheckpoint',
  simulationCheckpointSchema,
);
