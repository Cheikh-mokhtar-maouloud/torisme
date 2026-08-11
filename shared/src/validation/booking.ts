import { z } from 'zod';

import { BOOKING } from '../constants/config';
import { BookingStatus } from '../constants/enums';
import { isoDateSchema, objectIdSchema, paginationSchema } from './primitives';

/**
 * Une nuitée se compte en jours calendaires, pas en heures : une réservation du
 * 10 au 12 fait deux nuits, quelle que soit l'heure de saisie. Les dates sont
 * donc normalisées à minuit UTC avant toute comparaison, sinon deux clients
 * dans des fuseaux différents obtiendraient des durées différentes pour le même
 * séjour.
 */
export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function countNights(checkIn: Date, checkOut: Date): number {
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  return Math.round(
    (startOfUtcDay(checkOut).getTime() - startOfUtcDay(checkIn).getTime()) / millisecondsPerDay,
  );
}

export const createBookingSchema = z
  .object({
    roomId: objectIdSchema,
    checkIn: isoDateSchema,
    checkOut: isoDateSchema,
    guests: z.coerce.number().int().min(1).max(BOOKING.MAX_GUESTS),
  })
  .superRefine((value, ctx) => {
    const nights = countNights(value.checkIn, value.checkOut);

    if (nights < 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['checkOut'],
        message: 'La date de départ doit être postérieure à la date d’arrivée',
      });
      return;
    }

    if (nights > BOOKING.MAX_NIGHTS) {
      ctx.addIssue({
        code: 'custom',
        path: ['checkOut'],
        message: `Le séjour ne peut pas dépasser ${BOOKING.MAX_NIGHTS} nuits`,
      });
    }

    // Le passé est refusé côté serveur : le client peut avoir une horloge fausse
    // ou une requête forgée.
    if (startOfUtcDay(value.checkIn) < startOfUtcDay(new Date())) {
      ctx.addIssue({
        code: 'custom',
        path: ['checkIn'],
        message: 'La date d’arrivée ne peut pas être dans le passé',
      });
    }
  });
export type CreateBookingInput = z.infer<typeof createBookingSchema>;

export const availabilityQuerySchema = z
  .object({
    checkIn: isoDateSchema,
    checkOut: isoDateSchema,
  })
  .refine((value) => countNights(value.checkIn, value.checkOut) >= 1, {
    message: 'La date de départ doit être postérieure à la date d’arrivée',
    path: ['checkOut'],
  });
export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;

export const bookingListQuerySchema = paginationSchema.extend({
  status: z.enum(BookingStatus).optional(),
  /** Réservé aux administrateurs ; ignoré pour un utilisateur standard. */
  userId: objectIdSchema.optional(),
  /** Recherche par référence (« TP-… »), réservée aux administrateurs. */
  search: z.string().trim().min(2).max(40).optional(),
});
export type BookingListQuery = z.infer<typeof bookingListQuerySchema>;

export const cancelBookingSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});
export type CancelBookingInput = z.infer<typeof cancelBookingSchema>;
