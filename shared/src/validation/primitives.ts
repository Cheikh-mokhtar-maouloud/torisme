import { z } from 'zod';

import { GEO, PAGINATION } from '../constants/config';

/** ObjectId MongoDB : 24 caractères hexadécimaux. */
export const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Identifiant invalide');

export const emailSchema = z.email('Email invalide').trim().toLowerCase().max(254);

/**
 * Politique de mot de passe : longueur minimale réelle plutôt qu'un jeu de règles
 * complexes, conformément aux recommandations NIST 800-63B.
 */
export const passwordSchema = z
  .string()
  .min(8, 'Le mot de passe doit contenir au moins 8 caractères')
  .max(128, 'Le mot de passe est trop long');

/** Format E.164 permissif (la Mauritanie utilise +222). */
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[1-9]\d{6,14}$/, 'Numéro de téléphone invalide');

export const latitudeSchema = z.coerce.number().min(-90).max(90);
export const longitudeSchema = z.coerce.number().min(-180).max(180);

/** Point GeoJSON. Attention à l'ordre : [longitude, latitude]. */
export const geoPointSchema = z.object({
  type: z.literal('Point'),
  coordinates: z.tuple([longitudeSchema, latitudeSchema]),
});

export const addressSchema = z.object({
  line1: z.string().trim().max(200).optional(),
  city: z.string().trim().min(1).max(100),
  region: z.string().trim().max(100).optional(),
  country: z.string().trim().min(1).max(100),
  countryCode: z.string().trim().length(2).toUpperCase(),
  postalCode: z.string().trim().max(20).optional(),
});

export const imageRefSchema = z.object({
  url: z.url(),
  providerId: z.string().max(255).optional(),
  alt: z.string().max(255).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  order: z.number().int().min(0),
});

/** Heure au format HH:mm sur 24 h. */
export const timeOfDaySchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Heure invalide (format attendu HH:mm)');

export const isoDateSchema = z.coerce.date();

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(PAGINATION.DEFAULT_PAGE),
  limit: z.coerce.number().int().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
});

export const sortSchema = z.object({
  sortBy: z.string().max(50).optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

/**
 * Filtre géographique. Latitude et longitude vont par paire : fournir l'une
 * sans l'autre est une erreur de requête, pas un filtre partiel.
 */
export const geoQuerySchema = z
  .object({
    latitude: latitudeSchema.optional(),
    longitude: longitudeSchema.optional(),
    radiusMeters: z.coerce
      .number()
      .int()
      .positive()
      .max(GEO.MAX_RADIUS_METERS)
      .default(GEO.DEFAULT_RADIUS_METERS),
  })
  .refine((v) => (v.latitude === undefined) === (v.longitude === undefined), {
    message: 'latitude et longitude doivent être fournies ensemble',
    path: ['latitude'],
  });
