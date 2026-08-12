import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose';

import { PlaceType } from '@tourism/shared/constants';

import { baseSchemaOptions } from './shared-schemas';

const favoriteSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    targetType: { type: String, enum: Object.values(PlaceType), required: true },
    targetId: { type: Schema.Types.ObjectId, required: true },
  },
  baseSchemaOptions,
);

// Liste des favoris d'un utilisateur, du plus récent au plus ancien.
favoriteSchema.index({ userId: 1, createdAt: -1 });

/**
 * Un favori unique par utilisateur et par lieu.
 *
 * L'index rend l'ajout idempotent sans lecture préalable : deux appuis rapides
 * sur le bouton ne peuvent pas créer deux entrées.
 */
favoriteSchema.index({ userId: 1, targetType: 1, targetId: 1 }, { unique: true });

export type FavoriteDocument = InferSchemaType<typeof favoriteSchema>;

export const Favorite: Model<FavoriteDocument> =
  (models.Favorite as Model<FavoriteDocument>) ??
  model<FavoriteDocument>('Favorite', favoriteSchema);
