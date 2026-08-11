import { z } from 'zod';

import { ContentStatus } from '../constants/enums';
import {
  addressSchema,
  geoPointSchema,
  imageRefSchema,
  objectIdSchema,
  paginationSchema,
  timeOfDaySchema,
} from './primitives';

/**
 * Horaires d'ouverture : clé = jour de la semaine (0 = dimanche), valeur = créneaux.
 * Plusieurs créneaux permettent de représenter une coupure méridienne.
 */
export const openingHoursSchema = z.record(
  z.enum(['0', '1', '2', '3', '4', '5', '6']),
  z
    .array(z.object({ open: timeOfDaySchema, close: timeOfDaySchema }))
    .max(3, 'Trois créneaux maximum par jour'),
);

/** Paramètres communs à toutes les listes publiques. */
export const listQuerySchema = paginationSchema.extend({
  /** Recherche plein texte sur le nom et la description. */
  search: z.string().trim().min(1).max(120).optional(),
  city: z.string().trim().min(1).max(100).optional(),
  countryCode: z.string().trim().length(2).toUpperCase().optional(),
  status: z.enum(ContentStatus).optional(),
  sortBy: z.string().trim().max(50).optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

/**
 * Champs communs à tout lieu affichable sur la carte.
 *
 * Les champs dérivés (`rating`, `reviewCount`) sont volontairement absents :
 * ils sont recalculés par le service qui possède les avis et ne doivent jamais
 * être acceptés depuis un client, même administrateur.
 */
export const placeBaseSchema = z.object({
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().min(10).max(5_000),
  address: addressSchema,
  location: geoPointSchema,
  images: z.array(imageRefSchema).max(30).default([]),
  status: z.enum(ContentStatus).default(ContentStatus.DRAFT),
});

export const objectIdParamSchema = z.object({ id: objectIdSchema });

export const categoryIdsSchema = z.array(objectIdSchema).max(10).default([]);
