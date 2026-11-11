import { Schema, model, type InferSchemaType } from 'mongoose';

const relationEventSchema = new Schema(
  {
    day: { type: Number, default: 0 },
    at: { type: Date, default: () => new Date() },
    kind: { type: String, required: true },
    delta: { type: Number, default: 0 },
    note: { type: String, default: '' },
  },
  { _id: false },
);

/**
 * One bilateral relationship, stored once per pair.
 *
 * `key` is the two country codes sorted and joined, so A–B and B–A always resolve
 * to the same document and a unique index prevents a duplicate pair.
 */
const diplomaticRelationSchema = new Schema(
  {
    worldId: { type: Schema.Types.ObjectId, ref: 'World', required: true, index: true },
    key: { type: String, required: true },
    aCode: { type: String, required: true, index: true },
    aName: { type: String, required: true },
    bCode: { type: String, required: true, index: true },
    bName: { type: String, required: true },
    status: {
      type: String,
      enum: ['recognised', 'unrecognised', 'suspended', 'severed'],
      default: 'recognised',
    },
    score: { type: Number, default: 0, min: -100, max: 100 },
    trust: { type: Number, default: 50, min: 0, max: 100 },
    influence: { type: Number, default: 50, min: 0, max: 100 },
    strategicImportance: { type: Number, default: 40, min: 0, max: 100 },
    tradeDependency: { type: Number, default: 20, min: 0, max: 100 },
    militaryThreat: { type: Number, default: 20, min: 0, max: 100 },
    lastInteractionDay: { type: Number, default: null },
    lastInteractionAt: { type: Date, default: null },
    history: { type: [relationEventSchema], default: [] },
  },
  { timestamps: true, versionKey: false, collection: 'diplomatic_relations' },
);

diplomaticRelationSchema.index({ worldId: 1, key: 1 }, { unique: true });

export type DiplomaticRelation = InferSchemaType<typeof diplomaticRelationSchema>;

export const DiplomaticRelationModel = model<DiplomaticRelation>(
  'DiplomaticRelation',
  diplomaticRelationSchema,
);
