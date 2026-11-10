import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

const mapConfigSchema = new Schema(
  {
    center: { type: [Number], required: true },
    zoom: { type: Number, required: true },
    minZoom: { type: Number, default: 1 },
    maxZoom: { type: Number, default: 9 },
    projection: { type: String, default: 'mercator' },
    oceanColor: { type: String, default: '#070b11' },
    landOpacity: { type: Number, default: 0.6 },
  },
  { _id: false },
);

const simulationSettingsSchema = new Schema(
  {
    speed: { type: String, default: 'paused' },
    difficulty: { type: String, default: 'standard' },
    startYear: { type: Number, default: 2031 },
    autoAdvance: { type: Boolean, default: false },
  },
  { _id: false },
);

const worldSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    // `unique` here is the single source of truth for the index that makes
    // world generation idempotent; it is not also declared via schema.index().
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    description: { type: String, default: '', maxlength: 800 },
    seed: { type: String, required: true },
    currentSimulationDate: { type: Date, required: true },
    mapConfig: { type: mapConfigSchema, required: true },
    countryCount: { type: Number, required: true },
    continentCount: { type: Number, required: true },
    simulationSettings: { type: simulationSettingsSchema, required: true },
  },
  { timestamps: true, versionKey: false, collection: 'worlds' },
);

export type World = InferSchemaType<typeof worldSchema>;
export type WorldDocument = HydratedDocument<World>;

export const WorldModel = model<World>('World', worldSchema);
