import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { geometrySchema } from './geometry.schema.js';

const provinceSchema = new Schema(
  {
    worldId: { type: Schema.Types.ObjectId, ref: 'World', required: true, index: true },
    countryId: { type: Schema.Types.ObjectId, ref: 'Country', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    geometry: { type: geometrySchema, required: true },
    centroid: { type: [Number], required: true },
    population: { type: Number, required: true, min: 0 },
    resources: { type: [String], default: [] },
    terrain: { type: String, required: true },
    /** 0–100. */
    infrastructure: { type: Number, required: true, min: 0, max: 100 },
    currentOwner: { type: String, required: true, index: true },
    currentController: { type: String, required: true, index: true },
  },
  { timestamps: true, versionKey: false, collection: 'provinces' },
);

provinceSchema.index({ worldId: 1, countryId: 1 });

export type Province = InferSchemaType<typeof provinceSchema>;
export type ProvinceDocument = HydratedDocument<Province>;

export const ProvinceModel = model<Province>('Province', provinceSchema);
