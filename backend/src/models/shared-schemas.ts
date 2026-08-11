import { Schema } from 'mongoose';

import { ContentStatus, Currency } from '@tourism/shared/constants';

/**
 * Options appliquées à tous les schémas.
 *
 * La transformation `toJSON` est le point de passage unique entre un document
 * Mongoose et le DTO exposé par l'API : elle renomme `_id` en `id` et supprime
 * `__v`. Sans elle, chaque service devrait sérialiser à la main, et un oubli
 * ferait fuiter la forme interne des documents.
 *
 * Le type de cet objet est volontairement laissé à l'inférence : l'annoter
 * `SchemaOptions` (générique, dont les paramètres se résoudraient ici sur
 * `unknown`) casse `InferSchemaType`, qui renverrait alors `{}` pour tous les
 * modèles — sans erreur de compilation à l'endroit fautif.
 */
export const baseSchemaOptions = {
  timestamps: true,
  // `as const` conserve le littéral `false` : élargi en `boolean`, il ne
  // correspondrait plus au type attendu (`string | false`).
  versionKey: false,
  toJSON: {
    virtuals: true,
    transform(_doc: unknown, ret: Record<string, unknown>) {
      ret.id = String(ret._id);
      delete ret._id;
      return ret;
    },
  },
  toObject: { virtuals: true },
} as const;

/** Point GeoJSON. Rappel : les coordonnées sont dans l'ordre [longitude, latitude]. */
export const geoPointSchema = new Schema(
  {
    type: { type: String, enum: ['Point'], required: true, default: 'Point' },
    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator: (value: number[]) =>
          value.length === 2 &&
          typeof value[0] === 'number' &&
          typeof value[1] === 'number' &&
          value[0] >= -180 &&
          value[0] <= 180 &&
          value[1] >= -90 &&
          value[1] <= 90,
        message: 'Coordonnées invalides : attendu [longitude, latitude]',
      },
    },
  },
  { _id: false },
);

export const addressSchema = new Schema(
  {
    line1: { type: String, trim: true },
    city: { type: String, required: true, trim: true, index: true },
    region: { type: String, trim: true },
    country: { type: String, required: true, trim: true },
    countryCode: { type: String, required: true, uppercase: true, minlength: 2, maxlength: 2 },
    postalCode: { type: String, trim: true },
  },
  { _id: false },
);

export const imageRefSchema = new Schema(
  {
    url: { type: String, required: true },
    providerId: { type: String },
    alt: { type: String },
    width: { type: Number },
    height: { type: Number },
    order: { type: Number, required: true, default: 0 },
  },
  { _id: false },
);

/** Créneau horaire d'ouverture. */
export const openingSlotSchema = new Schema(
  {
    open: { type: String, required: true },
    close: { type: String, required: true },
  },
  { _id: false },
);

/** Champs de statut et de notation communs à tous les lieux. */
export const placeFields = {
  status: {
    type: String,
    enum: Object.values(ContentStatus),
    default: ContentStatus.DRAFT,
    index: true,
  },
  // Champs dérivés : écrits uniquement par le service des avis.
  rating: { type: Number, default: 0, min: 0, max: 5 },
  reviewCount: { type: Number, default: 0, min: 0 },
} as const;

export const currencyField = {
  type: String,
  enum: Object.values(Currency),
  required: true,
} as const;
