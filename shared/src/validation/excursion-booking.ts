import { z } from 'zod';

import { BookingStatus } from '../constants/enums';
import { objectIdSchema, paginationSchema } from './primitives';

/**
 * Plafond de places par réservation.
 *
 * Une excursion se réserve pour un groupe, pas pour un car entier : sans borne,
 * une seule demande pourrait vider une sortie de vingt places et bloquer tous
 * les autres clients.
 */
export const MAX_SEATS_PER_BOOKING = 10;

export const createExcursionBookingSchema = z.object({
  excursionId: objectIdSchema,
  seats: z.coerce.number().int().min(1).max(MAX_SEATS_PER_BOOKING),
});
export type CreateExcursionBookingInput = z.infer<typeof createExcursionBookingSchema>;

export const excursionBookingListQuerySchema = paginationSchema.extend({
  status: z.enum(BookingStatus).optional(),
  excursionId: objectIdSchema.optional(),
  /** Recherche par référence, réservée aux administrateurs. */
  search: z.string().trim().min(2).max(40).optional(),
});
export type ExcursionBookingListQuery = z.infer<typeof excursionBookingListQuerySchema>;
