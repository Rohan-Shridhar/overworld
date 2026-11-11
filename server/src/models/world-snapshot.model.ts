import { Schema, model, type InferSchemaType } from 'mongoose';

const countrySnapshotSchema = new Schema(
  {
    code: { type: String, required: true },
    gdp: { type: Number, required: true },
    stability: { type: Number, required: true },
    gdpGrowth: { type: Number, default: 0 },
    inflation: { type: Number, default: 0 },
    debt: { type: Number, default: 0 },
  },
  { _id: false },
);

/**
 * Manual checkpoint. Restoring one rewrites world and country state but never
 * deletes events: history stays append-only by design.
 */
const worldSnapshotSchema = new Schema(
  {
    worldId: { type: Schema.Types.ObjectId, ref: 'World', required: true, index: true },
    label: { type: String, required: true, maxlength: 120 },
    day: { type: Number, required: true, min: 0 },
    simulationDate: { type: Date, required: true },
    eventCount: { type: Number, default: 0 },
    countries: { type: [countrySnapshotSchema], default: [] },
    settings: {
      speed: { type: Number, default: 1 },
      paused: { type: Boolean, default: true },
    },
  },
  { timestamps: true, versionKey: false, collection: 'world_snapshots' },
);

worldSnapshotSchema.index({ worldId: 1, day: -1 });

export type WorldSnapshot = InferSchemaType<typeof worldSnapshotSchema>;

export const WorldSnapshotModel = model<WorldSnapshot>('WorldSnapshot', worldSnapshotSchema);
