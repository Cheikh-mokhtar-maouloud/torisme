import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose';

import { PlaceType, ReviewStatus } from '@tourism/shared/constants';

import { baseSchemaOptions, imageRefSchema } from './shared-schemas';

const reviewSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    /**
     * Cible polymorphe : le couple (type, identifiant) désigne l'entité notée.
     * Une référence Mongoose unique ne conviendrait pas, les avis portant sur
     * quatre collections différentes.
     */
    targetType: { type: String, enum: Object.values(PlaceType), required: true },
    targetId: { type: Schema.Types.ObjectId, required: true },

    /**
     * Réservation justifiant l'avis, exigée pour les types réservables.
     * C'est la seule barrière réellement efficace contre les faux avis.
     */
    bookingId: { type: Schema.Types.ObjectId },

    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, maxlength: 2000 },
    images: { type: [imageRefSchema], default: [] },

    status: {
      type: String,
      enum: Object.values(ReviewStatus),
      default: ReviewStatus.PENDING,
      index: true,
    },
    moderatedAt: { type: Date },
    moderationReason: { type: String, maxlength: 500 },

    /** Nombre de signalements. Sert à trier la file de modération. */
    reportCount: { type: Number, default: 0 },
  },
  baseSchemaOptions,
);

// Avis approuvés d'un lieu : requête de la fiche publique.
reviewSchema.index({ targetType: 1, targetId: 1, status: 1, createdAt: -1 });

/**
 * Un seul avis par utilisateur et par lieu.
 *
 * L'index unique est la garantie réelle : un contrôle applicatif seul laisserait
 * passer deux envois simultanés, et un même client pourrait gonfler la note.
 */
reviewSchema.index({ userId: 1, targetType: 1, targetId: 1 }, { unique: true });

export type ReviewDocument = InferSchemaType<typeof reviewSchema>;

export const Review: Model<ReviewDocument> =
  (models.Review as Model<ReviewDocument>) ?? model<ReviewDocument>('Review', reviewSchema);
