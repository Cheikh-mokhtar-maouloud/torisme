import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose';

import {
  addressSchema,
  baseSchemaOptions,
  currencyField,
  geoPointSchema,
  imageRefSchema,
  placeFields,
} from './shared-schemas';

const hotelSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, required: true, trim: true, maxlength: 5000 },
    address: { type: addressSchema, required: true },
    location: { type: geoPointSchema, required: true },
    images: { type: [imageRefSchema], default: [] },
    stars: { type: Number, min: 1, max: 5 },
    amenities: { type: [String], default: [], index: true },
    rules: { type: [String], default: [] },
    checkInTime: { type: String, default: '14:00' },
    checkOutTime: { type: String, default: '12:00' },
    phone: { type: String, trim: true },
    currency: currencyField,
    /**
     * Dénormalisé depuis les chambres publiées, pour permettre de trier et de
     * filtrer une liste d'hôtels sans agrégation. Recalculé par le service des
     * chambres à chaque écriture — jamais accepté depuis un client.
     */
    minPricePerNight: { type: Number, min: 0 },
    ...placeFields,
  },
  baseSchemaOptions,
);

// Recherche par proximité (carte, « autour de moi »).
hotelSchema.index({ location: '2dsphere' });
// Liste filtrée par ville, cas d'usage principal de l'écran de recherche.
hotelSchema.index({ 'address.city': 1, status: 1 });
// Recherche plein texte. Le poids favorise une correspondance sur le nom.
hotelSchema.index({ name: 'text', description: 'text' }, { weights: { name: 10, description: 1 } });
hotelSchema.index({ status: 1, rating: -1 });

export type HotelDocument = InferSchemaType<typeof hotelSchema>;

export const Hotel: Model<HotelDocument> =
  (models.Hotel as Model<HotelDocument>) ?? model<HotelDocument>('Hotel', hotelSchema);
