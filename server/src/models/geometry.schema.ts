import { Schema } from 'mongoose';

/** GeoJSON geometry shared by countries and provinces. */
export const geometrySchema = new Schema(
  {
    type: {
      type: String,
      enum: ['Polygon', 'MultiPolygon'],
      required: true,
    },
    coordinates: {
      type: Schema.Types.Mixed,
      required: true,
    },
  },
  { _id: false },
);
