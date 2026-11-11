import { Schema, model, type InferSchemaType } from 'mongoose';
import { INVITATION_STATUSES } from '../diplomacy/diplomacy.constants.js';

const allianceInvitationSchema = new Schema(
  {
    worldId: { type: Schema.Types.ObjectId, ref: 'World', required: true, index: true },
    allianceId: { type: Schema.Types.ObjectId, ref: 'Alliance', required: true, index: true },
    allianceName: { type: String, required: true },
    targetCode: { type: String, required: true },
    invitedBy: { type: String, required: true },
    status: { type: String, enum: INVITATION_STATUSES, default: 'pending' },
    createdDay: { type: Number, required: true, min: 0 },
    expiresDay: { type: Number, required: true, min: 0 },
    resolvedDay: { type: Number, default: null },
    note: { type: String, default: '' },
  },
  { timestamps: true, versionKey: false, collection: 'alliance_invitations' },
);

allianceInvitationSchema.index({ worldId: 1, status: 1, targetCode: 1 });

export type AllianceInvitation = InferSchemaType<typeof allianceInvitationSchema>;

export const AllianceInvitationModel = model<AllianceInvitation>(
  'AllianceInvitation',
  allianceInvitationSchema,
);
