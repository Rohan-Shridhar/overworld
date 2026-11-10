import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { geometrySchema } from './geometry.schema.js';

const resourceOutputSchema = new Schema(
  {
    resource: { type: String, required: true },
    output: { type: Number, required: true, min: 0 },
    unit: { type: String, default: 'kt' },
  },
  { _id: false },
);

const treatySchema = new Schema(
  {
    name: { type: String, required: true },
    partner: { type: String, required: true },
    signedAt: { type: Date, required: true },
  },
  { _id: false },
);

const baseSchema = new Schema(
  {
    name: { type: String, required: true },
    province: { type: String, default: '' },
    branch: { type: String, enum: ['army', 'navy', 'air'], default: 'army' },
    personnel: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

const deploymentSchema = new Schema(
  {
    name: { type: String, required: true },
    province: { type: String, default: '' },
    strength: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: ['garrison', 'deployed', 'exercising'], default: 'garrison' },
  },
  { _id: false },
);

const historyEntrySchema = new Schema(
  {
    at: { type: Date, required: true },
    title: { type: String, required: true },
    detail: { type: String, default: '' },
    kind: {
      type: String,
      enum: ['foundation', 'government', 'territory', 'administration'],
      default: 'foundation',
    },
  },
  { _id: false },
);

const economySchema = new Schema(
  {
    gdpGrowth: { type: Number, default: 2.1 },
    inflation: { type: Number, default: 3.4 },
    debt: { type: Number, default: 48 },
    currency: { type: String, default: 'Credits' },
    tradeBalance: { type: Number, default: 0 },
    resourceProduction: { type: [resourceOutputSchema], default: [] },
  },
  { _id: false },
);

const militarySchema = new Schema(
  {
    personnel: { type: Number, default: 0, min: 0 },
    army: { type: Number, default: 0, min: 0 },
    navy: { type: Number, default: 0, min: 0 },
    airForce: { type: Number, default: 0, min: 0 },
    equipment: {
      tanks: { type: Number, default: 0, min: 0 },
      aircraft: { type: Number, default: 0, min: 0 },
      ships: { type: Number, default: 0, min: 0 },
      artillery: { type: Number, default: 0, min: 0 },
    },
    bases: { type: [baseSchema], default: [] },
    deployments: { type: [deploymentSchema], default: [] },
  },
  { _id: false },
);

const diplomacySchema = new Schema(
  {
    status: { type: String, default: 'Neutral' },
    alliances: { type: [String], default: [] },
    treaties: { type: [treatySchema], default: [] },
    rivals: { type: [String], default: [] },
    sanctions: { type: [String], default: [] },
    tradePartners: { type: [String], default: [] },
  },
  { _id: false },
);

const governmentSchema = new Schema(
  {
    environment: { type: String, default: 'Stable' },
    ideology: { type: String, default: 'Pragmatic' },
    rulingParty: { type: String, default: 'Civic Union' },
    nextElection: { type: Date, default: null },
  },
  { _id: false },
);

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
    /** Square degrees, summed from the provinces that belong to this country. */
    area: { type: Number, default: 0, min: 0 },
    resources: { type: [String], default: [] },
    economy: { type: economySchema, default: () => ({}) },
    military: { type: militarySchema, default: () => ({}) },
    diplomacy: { type: diplomacySchema, default: () => ({}) },
    government: { type: governmentSchema, default: () => ({}) },
    history: { type: [historyEntrySchema], default: [] },
    isAdminEdited: { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false, collection: 'countries' },
);

countrySchema.index({ worldId: 1, shortCode: 1 }, { unique: true });
countrySchema.index({ worldId: 1, name: 1 });
countrySchema.index({ worldId: 1, continent: 1 });

export type Country = InferSchemaType<typeof countrySchema>;
export type CountryDocument = HydratedDocument<Country>;

export const CountryModel = model<Country>('Country', countrySchema);
