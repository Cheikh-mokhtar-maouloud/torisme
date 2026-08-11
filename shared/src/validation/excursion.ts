import { z } from 'zod';

import { Currency, ExcursionStatus } from '../constants/enums';
import { listQuerySchema } from './common';
import {
  addressSchema,
  geoPointSchema,
  imageRefSchema,
  isoDateSchema,
  timeOfDaySchema,
} from './primitives';

const itineraryStepSchema = z.object({
  time: timeOfDaySchema.optional(),
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(1_000).optional(),
});

/**
 * `availableSeats` est absent volontairement : le nombre de places restantes est
 * dérivé des réservations et décrémenté de façon atomique par le service
 * (Phase 9). L'accepter depuis un client permettrait de recréer des places
 * déjà vendues.
 */
export const createExcursionSchema = z.object({
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().min(10).max(5_000),
  images: z.array(imageRefSchema).max(30).default([]),
  destination: z.string().trim().min(2).max(160),
  departureLocation: geoPointSchema,
  departureAddress: addressSchema,
  itinerary: z.array(itineraryStepSchema).max(30).default([]),
  durationMinutes: z.coerce
    .number()
    .int()
    .min(15)
    .max(60 * 24 * 30),
  startsAt: isoDateSchema,
  price: z.coerce.number().min(0).max(100_000_000),
  currency: z.enum(Currency),
  totalSeats: z.coerce.number().int().min(1).max(1_000),
  guideName: z.string().trim().max(120).optional(),
  status: z.enum(ExcursionStatus).default(ExcursionStatus.SCHEDULED),
});
export type CreateExcursionInput = z.infer<typeof createExcursionSchema>;

export const updateExcursionSchema = createExcursionSchema.partial();
export type UpdateExcursionInput = z.infer<typeof updateExcursionSchema>;

export const excursionListQuerySchema = listQuerySchema.extend({
  /** Par défaut, seules les excursions à venir sont listées. */
  includePast: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  maxPrice: z.coerce.number().positive().optional(),
  availableOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
  excursionStatus: z.enum(ExcursionStatus).optional(),
});
export type ExcursionListQuery = z.infer<typeof excursionListQuerySchema>;
