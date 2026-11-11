import { Schema, model, type InferSchemaType } from 'mongoose';
import { MESSAGE_KINDS } from '../diplomacy/diplomacy.constants.js';

/** Every note, warning and negotiation outcome between two states. */
const diplomaticMessageSchema = new Schema(
  {
    worldId: { type: Schema.Types.ObjectId, ref: 'World', required: true, index: true },
    fromCode: { type: String, required: true },
    toCode: { type: String, required: true },
    kind: { type: String, enum: MESSAGE_KINDS, required: true },
    subject: { type: String, default: '', maxlength: 160 },
    body: { type: String, default: '', maxlength: 1200 },
    day: { type: Number, required: true, min: 0 },
    outcome: { type: String, default: '' },
    meta: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, versionKey: false, collection: 'diplomatic_messages' },
);

diplomaticMessageSchema.index({ worldId: 1, day: -1 });

export type DiplomaticMessage = InferSchemaType<typeof diplomaticMessageSchema>;

export const DiplomaticMessageModel = model<DiplomaticMessage>(
  'DiplomaticMessage',
  diplomaticMessageSchema,
);
