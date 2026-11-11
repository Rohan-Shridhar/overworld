import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * Central event record. Every entry is produced by a simulation change; nothing
 * here is authored prose. News views read this collection and never invent an
 * event that does not exist.
 */
const entitySchema = new Schema(
  {
    kind: { type: String, required: true },
    id: { type: String, default: '' },
    label: { type: String, default: '' },
  },
  { _id: false },
);

const worldEventSchema = new Schema(
  {
    worldId: { type: Schema.Types.ObjectId, ref: 'World', required: true, index: true },
    day: { type: Number, required: true, min: 0 },
    occurredAt: { type: Date, required: true },
    category: {
      type: String,
      enum: [
        'diplomacy',
        'alliances',
        'treaties',
        'military',
        'warfare',
        'economy',
        'resources',
        'government',
        'elections',
        'territorial',
        'disasters',
        'society',
        'climate',
        'infrastructure',
        'administration',
      ],
      required: true,
    },
    eventType: { type: String, default: 'simulation' },
    headline: { type: String, required: true, maxlength: 200 },
    detail: { type: String, required: true, maxlength: 800 },
    countryCode: { type: String, default: null },
    countryName: { type: String, default: null },
    countries: { type: [String], default: [] },
    provinces: { type: [String], default: [] },
    region: { type: String, default: null },
    importance: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'low' },
    severity: { type: String, enum: ['low', 'medium', 'high'], default: 'low' },
    consequences: { type: [String], default: [] },
    entities: { type: [entitySchema], default: [] },
    stabilityEffect: { type: Number, default: 0 },
    growthEffect: { type: Number, default: 0 },
    source: { type: String, default: 'simulation' },
  },
  { timestamps: true, versionKey: false, collection: 'world_events' },
);

worldEventSchema.index({ worldId: 1, day: -1 });
worldEventSchema.index({ worldId: 1, category: 1, day: -1 });
worldEventSchema.index({ worldId: 1, countries: 1, day: -1 });

export type WorldEvent = InferSchemaType<typeof worldEventSchema>;

export const WorldEventModel = model<WorldEvent>('WorldEvent', worldEventSchema);
