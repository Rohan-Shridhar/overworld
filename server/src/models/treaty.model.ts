import { Schema, model, type InferSchemaType } from 'mongoose';
import {
  RENEWAL_RULES,
  TREATY_STATUSES,
  TREATY_TYPES,
} from '../diplomacy/diplomacy.constants.js';

const clauseSchema = new Schema(
  {
    clauseId: { type: String, required: true },
    title: { type: String, required: true, maxlength: 120 },
    obligation: { type: String, required: true, maxlength: 400 },
    condition: { type: String, default: '', maxlength: 240 },
    penalty: { type: String, default: '', maxlength: 240 },
  },
  { _id: false },
);

const treatyEventSchema = new Schema(
  {
    day: { type: Number, required: true },
    at: { type: Date, default: () => new Date() },
    kind: { type: String, required: true },
    note: { type: String, default: '' },
  },
  { _id: false },
);

const violationSchema = new Schema(
  {
    day: { type: Number, required: true },
    partyCode: { type: String, required: true },
    clauseId: { type: String, default: '' },
    note: { type: String, default: '' },
  },
  { _id: false },
);

const treatySchema = new Schema(
  {
    worldId: { type: Schema.Types.ObjectId, ref: 'World', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    type: { type: String, enum: TREATY_TYPES, required: true },
    template: { type: String, default: '' },
    status: { type: String, enum: TREATY_STATUSES, default: 'draft' },
    parties: { type: [String], default: [] },
    proposedBy: { type: String, required: true },
    clauses: { type: [clauseSchema], default: [] },
    durationDays: { type: Number, required: true, min: 1 },
    createdDay: { type: Number, required: true, min: 0 },
    effectiveDay: { type: Number, default: null },
    expirationDay: { type: Number, default: null },
    renewal: { type: String, enum: RENEWAL_RULES, default: 'none' },
    acceptedBy: { type: [String], default: [] },
    terminatedDay: { type: Number, default: null },
    violations: { type: [violationSchema], default: [] },
    history: { type: [treatyEventSchema], default: [] },
  },
  { timestamps: true, versionKey: false, collection: 'treaties' },
);

treatySchema.index({ worldId: 1, status: 1 });
treatySchema.index({ worldId: 1, parties: 1 });

export type Treaty = InferSchemaType<typeof treatySchema>;

export const TreatyModel = model<Treaty>('Treaty', treatySchema);
