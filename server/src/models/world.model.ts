import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import {
  DEFAULT_CHECKPOINT_INTERVAL_DAYS,
  DEFAULT_EVENT_FREQUENCY,
  DEFAULT_SPEED,
  EVENT_FREQUENCIES,
  MAX_CHECKPOINT_INTERVAL_DAYS,
  MIN_CHECKPOINT_INTERVAL_DAYS,
  SUPPORTED_SPEEDS,
} from '../simulation/simulation.constants.js';

const mapConfigSchema = new Schema(
  {
    center: { type: [Number], required: true },
    zoom: { type: Number, required: true },
    minZoom: { type: Number, default: 1 },
    maxZoom: { type: Number, default: 9 },
    projection: { type: String, default: 'mercator' },
    oceanColor: { type: String, default: '#070b11' },
    landOpacity: { type: Number, default: 0.6 },
  },
  { _id: false },
);

/**
 * Simulation settings are part of the world document because the backend is
 * the only authority on simulated time: a restart restores them from here.
 */
const simulationSettingsSchema = new Schema(
  {
    speed: { type: Number, enum: SUPPORTED_SPEEDS, default: DEFAULT_SPEED },
    paused: { type: Boolean, default: false },
    autoAdvance: { type: Boolean, default: true },
    eventFrequency: {
      type: String,
      enum: EVENT_FREQUENCIES,
      default: DEFAULT_EVENT_FREQUENCY,
    },
    checkpointIntervalDays: {
      type: Number,
      min: MIN_CHECKPOINT_INTERVAL_DAYS,
      max: MAX_CHECKPOINT_INTERVAL_DAYS,
      default: DEFAULT_CHECKPOINT_INTERVAL_DAYS,
    },
    difficulty: { type: String, default: 'standard' },
    startYear: { type: Number, default: 2031 },
  },
  { _id: false },
);

/** Bookkeeping written on every committed tick, used for restart recovery. */
const simulationStateSchema = new Schema(
  {
    lastTickAt: { type: Date, default: null },
    lastDay: { type: Number, default: 0, min: 0 },
    tickCount: { type: Number, default: 0, min: 0 },
    lastCheckpointDay: { type: Number, default: null },
    lastRestoredAt: { type: Date, default: null },
    /**
     * Headline statistics of the most recent committed tick. Stored so a
     * serverless read can build a snapshot without re-aggregating every country.
     */
    lastStats: {
      countries: { type: Number, default: 0 },
      totalGdp: { type: Number, default: 0 },
      averageStability: { type: Number, default: 0 },
      averageGrowth: { type: Number, default: 0 },
      eventsToday: { type: Number, default: 0 },
    },
    /** Last failure recorded by a request-driven advancement pass. */
    lastError: { type: String, default: null },
  },
  { _id: false },
);

const worldSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    // `unique` here is the single source of truth for the index that makes
    // world generation idempotent; it is not also declared via schema.index().
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    description: { type: String, default: '', maxlength: 800 },
    seed: { type: String, required: true },
    currentSimulationDate: { type: Date, required: true },
    mapConfig: { type: mapConfigSchema, required: true },
    countryCount: { type: Number, required: true },
    continentCount: { type: Number, required: true },
    simulationSettings: { type: simulationSettingsSchema, required: true },
    simulationState: { type: simulationStateSchema, default: () => ({}) },
  },
  { timestamps: true, versionKey: false, collection: 'worlds' },
);

export type World = InferSchemaType<typeof worldSchema>;
export type WorldDocument = HydratedDocument<World>;

export const WorldModel = model<World>('World', worldSchema);
