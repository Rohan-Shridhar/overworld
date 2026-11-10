import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

/**
 * A named simulation configuration. The simulation engine itself lands in a later
 * release; this schema exists so the persistence layer has a real collection to
 * verify connections against and so the API has an entity to grow into.
 */
const scenarioSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'A scenario needs a name'],
      trim: true,
      maxlength: [120, 'Scenario names are limited to 120 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Scenario descriptions are limited to 500 characters'],
      default: '',
    },
    status: {
      type: String,
      enum: {
        values: ['draft', 'active', 'archived'],
        message: '{VALUE} is not a supported scenario status',
      },
      default: 'draft',
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    collection: 'scenarios',
  },
);

scenarioSchema.index({ name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

export type Scenario = InferSchemaType<typeof scenarioSchema>;
export type ScenarioDocument = HydratedDocument<Scenario>;

export const ScenarioModel = model<Scenario>('Scenario', scenarioSchema);
