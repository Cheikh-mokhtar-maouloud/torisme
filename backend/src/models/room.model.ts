import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose';

import { ContentStatus } from '@tourism/shared/constants';

import { baseSchemaOptions, currencyField, imageRefSchema } from './shared-schemas';

const roomSchema = new Schema(
  {
    hotelId: { type: Schema.Types.ObjectId, ref: 'Hotel', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, required: true, trim: true, maxlength: 3000 },
    images: { type: [imageRefSchema], default: [] },
    capacity: { type: Number, required: true, min: 1, max: 20 },
    bedCount: { type: Number, required: true, min: 1, max: 10 },
    amenities: { type: [String], default: [] },
    pricePerNight: { type: Number, required: true, min: 0 },
    currency: currencyField,
    /**
     * Nombre d'unités physiques de ce type de chambre.
     * La disponibilité d'une période se calcule en soustrayant les réservations
     * qui la chevauchent (Phase 8) — jamais en décrémentant ce champ.
     */
    totalUnits: { type: Number, required: true, min: 1, max: 500 },
    status: {
      type: String,
      enum: Object.values(ContentStatus),
      default: ContentStatus.DRAFT,
      index: true,
    },
  },
  baseSchemaOptions,
);

// Chambres d'un hôtel, triées par prix : requête de la page détail hôtel.
roomSchema.index({ hotelId: 1, status: 1, pricePerNight: 1 });

export type RoomDocument = InferSchemaType<typeof roomSchema>;

export const Room: Model<RoomDocument> =
  (models.Room as Model<RoomDocument>) ?? model<RoomDocument>('Room', roomSchema);
