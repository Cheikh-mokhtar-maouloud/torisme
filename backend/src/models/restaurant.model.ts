import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose';

import {
  addressSchema,
  baseSchemaOptions,
  geoPointSchema,
  imageRefSchema,
  openingSlotSchema,
  placeFields,
} from './shared-schemas';

const restaurantSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, required: true, trim: true, maxlength: 5000 },
    address: { type: addressSchema, required: true },
    location: { type: geoPointSchema, required: true },
    images: { type: [imageRefSchema], default: [] },
    cuisineTypes: { type: [String], default: [], index: true },
    // Facultative : voir le schéma de validation partagé.
    priceRange: { type: Number, min: 1, max: 4 },
    phone: { type: String, trim: true },
    /** Clé = jour de la semaine ('0' = dimanche), valeur = créneaux d'ouverture. */
    openingHours: {
      type: Map,
      of: [openingSlotSchema],
      default: undefined,
    },
    menuUrl: { type: String },
    categoryIds: { type: [Schema.Types.ObjectId], ref: 'Category', default: [], index: true },
    ...placeFields,
  },
  baseSchemaOptions,
);

restaurantSchema.index({ location: '2dsphere' });
restaurantSchema.index({ 'address.city': 1, status: 1 });
restaurantSchema.index(
  { name: 'text', description: 'text' },
  { weights: { name: 10, description: 1 } },
);

export type RestaurantDocument = InferSchemaType<typeof restaurantSchema>;

export const Restaurant: Model<RestaurantDocument> =
  (models.Restaurant as Model<RestaurantDocument>) ??
  model<RestaurantDocument>('Restaurant', restaurantSchema);
