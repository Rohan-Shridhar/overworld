import { Schema, model, type InferSchemaType } from 'mongoose';

/** Queued work for future simulated days, drained by the action processor. */
const scheduledActionSchema = new Schema(
  {
    worldId: { type: Schema.Types.ObjectId, ref: 'World', required: true, index: true },
    dueDay: { type: Number, required: true, min: 0 },
    type: { type: String, required: true, maxlength: 60 },
    payload: { type: Schema.Types.Mixed, default: {} },
    status: {
      type: String,
      enum: ['pending', 'completed', 'cancelled'],
      default: 'pending',
    },
    completedAt: { type: Date, default: null },
    result: { type: String, default: '' },
  },
  { timestamps: true, versionKey: false, collection: 'scheduled_actions' },
);

scheduledActionSchema.index({ worldId: 1, status: 1, dueDay: 1 });

export type ScheduledAction = InferSchemaType<typeof scheduledActionSchema>;

export const ScheduledActionModel = model<ScheduledAction>(
  'ScheduledAction',
  scheduledActionSchema,
);
