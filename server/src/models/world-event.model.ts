import { Schema, model, type InferSchemaType } from 'mongoose';
import { SIMULATION_EVENT_CATEGORIES } from '../simulation/simulation.constants.js';

/** Append-only news history produced by the simulation. */
const worldEventSchema = new Schema(
  {
    worldId: { type: Schema.Types.ObjectId, ref: 'World', required: true, index: true },
    day: { type: Number, required: true, min: 0 },
    occurredAt: { type: Date, required: true },
    category: { type: String, enum: SIMULATION_EVENT_CATEGORIES, required: true },
    headline: { type: String, required: true, maxlength: 200 },
    detail: { type: String, required: true, maxlength: 600 },
    countryCode: { type: String, default: null },
    countryName: { type: String, default: null },
    severity: { type: String, enum: ['low', 'medium', 'high'], default: 'low' },
    stabilityEffect: { type: Number, default: 0 },
    growthEffect: { type: Number, default: 0 },
  },
  { timestamps: true, versionKey: false, collection: 'world_events' },
);

worldEventSchema.index({ worldId: 1, day: -1 });

export type WorldEvent = InferSchemaType<typeof worldEventSchema>;

export const WorldEventModel = model<WorldEvent>('WorldEvent', worldEventSchema);
