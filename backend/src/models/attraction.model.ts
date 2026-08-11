import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose';

import { Currency } from '@tourism/shared/constants';

import {
  addressSchema,
  baseSchemaOptions,
  geoPointSchema,
  imageRefSchema,
  openingSlotSchema,
  placeFields,
} from './shared-schemas';

const attractionSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, required: true, trim: true, maxlength: 5000 },
    address: { type: addressSchema, required: true },
    location: { type: geoPointSchema, required: true },
    images: { type: [imageRefSchema], default: [] },
    categoryIds: { type: [Schema.Types.ObjectId], ref: 'Category', default: [], index: true },
    openingHours: { type: Map, of: [openingSlotSchema], default: undefined },
    /** Absent ou 0 = entrée gratuite. */
    entryFee: { type: Number, min: 0 },
    currency: { type: String, enum: Object.values(Currency) },
    ...placeFields,
  },
  baseSchemaOptions,
);

attractionSchema.index({ location: '2dsphere' });
attractionSchema.index({ 'address.city': 1, status: 1 });
attractionSchema.index(
  { name: 'text', description: 'text' },
  { weights: { name: 10, description: 1 } },
);

export type AttractionDocument = InferSchemaType<typeof attractionSchema>;

export const Attraction: Model<AttractionDocument> =
  (models.Attraction as Model<AttractionDocument>) ??
  model<AttractionDocument>('Attraction', attractionSchema);
