import { Schema, model, type InferSchemaType } from 'mongoose';
import { ALLIANCE_STATUSES, ALLIANCE_TYPES, VOTING_RULES } from '../diplomacy/diplomacy.constants.js';

const allianceSchema = new Schema(
  {
    worldId: { type: Schema.Types.ObjectId, ref: 'World', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, default: '', maxlength: 400 },
    emblem: { type: String, default: '◈', maxlength: 4 },
    type: { type: String, enum: ALLIANCE_TYPES, required: true },
    status: { type: String, enum: ALLIANCE_STATUSES, default: 'active' },
    foundedDay: { type: Number, required: true, min: 0 },
    foundedBy: { type: [String], default: [] },
    members: { type: [String], default: [] },
    leaderCode: { type: String, required: true },
    charter: { type: String, default: '', maxlength: 2000 },
    requirements: {
      minRelationScore: { type: Number, default: 15, min: -100, max: 100 },
      requiresRecognition: { type: Boolean, default: true },
      maxMembers: { type: Number, default: 12, min: 2, max: 12 },
    },
    votingRules: { type: String, enum: VOTING_RULES, default: 'majority' },
    militaryObligations: { type: String, default: '', maxlength: 500 },
    economicObligations: { type: String, default: '', maxlength: 500 },
    durationDays: { type: Number, default: null },
    withdrawalRules: { type: String, default: '', maxlength: 500 },
    dissolvedDay: { type: Number, default: null },
  },
  { timestamps: true, versionKey: false, collection: 'alliances' },
);

allianceSchema.index({ worldId: 1, name: 1 }, { unique: true });
allianceSchema.index({ worldId: 1, status: 1 });

export type Alliance = InferSchemaType<typeof allianceSchema>;

export const AllianceModel = model<Alliance>('Alliance', allianceSchema);
