import { z } from 'zod';

import { REVIEW } from '../constants/config';
import { PlaceType, ReviewStatus } from '../constants/enums';
import { imageRefSchema, objectIdSchema, paginationSchema } from './primitives';

/**
 * Types de lieux **réservables**.
 *
 * Pour ceux-là, un avis exige une réservation : c'est la seule barrière
 * réellement efficace contre les faux avis, qu'ils viennent d'un concurrent ou
 * de l'établissement lui-même. Restaurants et attractions n'ont pas de
 * réservation dans la plateforme ; leur avis reste ouvert, mais limité à un par
 * compte et soumis à modération.
 */
export const BOOKABLE_PLACE_TYPES = [PlaceType.HOTEL, PlaceType.EXCURSION] as const;

export function requiresBooking(targetType: PlaceType): boolean {
  return (BOOKABLE_PLACE_TYPES as readonly PlaceType[]).includes(targetType);
}

export const createReviewSchema = z.object({
  targetType: z.enum(PlaceType),
  targetId: objectIdSchema,
  rating: z.coerce.number().int().min(REVIEW.MIN_RATING).max(REVIEW.MAX_RATING),
  comment: z.string().trim().min(10).max(REVIEW.MAX_COMMENT_LENGTH).optional(),
  images: z.array(imageRefSchema).max(REVIEW.MAX_PHOTOS).default([]),
});
export type CreateReviewInput = z.infer<typeof createReviewSchema>;

export const reviewListQuerySchema = paginationSchema.extend({
  targetType: z.enum(PlaceType).optional(),
  targetId: objectIdSchema.optional(),
  /** Réservé aux administrateurs : le public ne voit que les avis approuvés. */
  status: z.enum(ReviewStatus).optional(),
  /** Réservé aux administrateurs : ne remonter que les avis signalés. */
  reportedOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
  /** `me` restreint aux avis de l'utilisateur courant, quel que soit leur statut. */
  scope: z.enum(['all', 'me']).optional(),
});
export type ReviewListQuery = z.infer<typeof reviewListQuerySchema>;

export const moderateReviewSchema = z.object({
  status: z.enum([ReviewStatus.APPROVED, ReviewStatus.REJECTED]),
  /** Motif interne, jamais exposé à l'auteur pour l'instant. */
  reason: z.string().trim().max(500).optional(),
});
export type ModerateReviewInput = z.infer<typeof moderateReviewSchema>;
