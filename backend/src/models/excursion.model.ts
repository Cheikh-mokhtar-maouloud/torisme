import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose';

import { ExcursionStatus } from '@tourism/shared/constants';

import {
  addressSchema,
  baseSchemaOptions,
  currencyField,
  geoPointSchema,
  imageRefSchema,
} from './shared-schemas';

const itineraryStepSchema = new Schema(
  {
    time: { type: String },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, trim: true, maxlength: 1000 },
  },
  { _id: false },
);

const excursionSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, required: true, trim: true, maxlength: 5000 },
    images: { type: [imageRefSchema], default: [] },
    destination: { type: String, required: true, trim: true, index: true },
    departureLocation: { type: geoPointSchema, required: true },
    departureAddress: { type: addressSchema, required: true },
    itinerary: { type: [itineraryStepSchema], default: [] },
    durationMinutes: { type: Number, required: true, min: 15 },
    startsAt: { type: Date, required: true, index: true },
    price: { type: Number, required: true, min: 0 },
    currency: currencyField,
    totalSeats: { type: Number, required: true, min: 1, max: 1000 },
    /**
     * Places restantes. Décrémenté de façon atomique lors d'une réservation
     * (`findOneAndUpdate` avec condition `$gte`), jamais par un lire-puis-écrire
     * qui autoriserait une survente en cas de réservations simultanées.
     */
    availableSeats: { type: Number, required: true, min: 0 },
    guideName: { type: String, trim: true },
    status: {
      type: String,
      enum: Object.values(ExcursionStatus),
      default: ExcursionStatus.SCHEDULED,
      index: true,
    },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    reviewCount: { type: Number, default: 0, min: 0 },
  },
  baseSchemaOptions,
);

// Requête principale : les excursions à venir, par ordre chronologique.
excursionSchema.index({ status: 1, startsAt: 1 });
excursionSchema.index({ departureLocation: '2dsphere' });
excursionSchema.index(
  { title: 'text', description: 'text', destination: 'text' },
  { weights: { title: 10, destination: 5, description: 1 } },
);

export type ExcursionDocument = InferSchemaType<typeof excursionSchema>;

export const Excursion: Model<ExcursionDocument> =
  (models.Excursion as Model<ExcursionDocument>) ??
  model<ExcursionDocument>('Excursion', excursionSchema);
