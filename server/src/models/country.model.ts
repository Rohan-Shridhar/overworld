import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { geometrySchema } from './geometry.schema.js';

const countrySchema = new Schema(
  {
    worldId: { type: Schema.Types.ObjectId, ref: 'World', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    shortCode: { type: String, required: true, trim: true, uppercase: true, minlength: 2, maxlength: 4 },
    flag: { type: String, required: true },
    capital: { type: String, required: true, trim: true },
    continent: { type: String, required: true, trim: true, index: true },
    description: { type: String, default: '', maxlength: 800 },
    colour: { type: String, required: true, match: /^#[0-9a-fA-F]{6}$/ },
    population: { type: Number, required: true, min: 0 },
    /** Gross domestic product in billions of USD. */
    gdp: { type: Number, required: true, min: 0 },
    governmentType: { type: String, required: true },
    leader: { type: String, required: true },
    /** 0–100. */
    stability: { type: Number, required: true, min: 0, max: 100 },
    geometry: { type: geometrySchema, required: true },
    centroid: { type: [Number], required: true },
  },
  { timestamps: true, versionKey: false, collection: 'countries' },
);

countrySchema.index({ worldId: 1, shortCode: 1 }, { unique: true });
countrySchema.index({ worldId: 1, name: 1 });

export type Country = InferSchemaType<typeof countrySchema>;
export type CountryDocument = HydratedDocument<Country>;

export const CountryModel = model<Country>('Country', countrySchema);
