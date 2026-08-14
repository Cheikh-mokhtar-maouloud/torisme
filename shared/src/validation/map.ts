import { z } from 'zod';

import { GEO } from '../constants/config';
import { PlaceType } from '../constants/enums';
import { latitudeSchema, longitudeSchema } from './primitives';

/**
 * Requête de carte.
 *
 * Deux modes, mutuellement exclusifs :
 *
 * - **cadre visible** (`swLat`, `swLng`, `neLat`, `neLng`) : ce dont une carte a
 *   réellement besoin quand l'utilisateur la déplace ou zoome. On demande les
 *   lieux visibles, pas les plus proches d'un centre.
 * - **autour d'un point** (`latitude`, `longitude`, `radiusMeters`) : pour un
 *   « autour de moi » trié par distance croissante.
 *
 * Sans aucun des deux, l'API renvoie les lieux publiés dans la limite de
 * `limit` — utile au premier affichage, avant que la carte ait un cadre.
 */
export const mapQuerySchema = z
  .object({
    /** Types demandés, séparés par des virgules : `?types=HOTEL,RESTAURANT`. */
    types: z
      .string()
      .optional()
      .transform((value) =>
        value
          ? value
              .split(',')
              .map((item) => item.trim().toUpperCase())
              .filter((item): item is PlaceType =>
                Object.values(PlaceType).includes(item as PlaceType),
              )
          : undefined,
      ),

    swLat: latitudeSchema.optional(),
    swLng: longitudeSchema.optional(),
    neLat: latitudeSchema.optional(),
    neLng: longitudeSchema.optional(),

    latitude: latitudeSchema.optional(),
    longitude: longitudeSchema.optional(),
    radiusMeters: z.coerce
      .number()
      .int()
      .positive()
      .max(GEO.MAX_RADIUS_METERS)
      .default(GEO.DEFAULT_RADIUS_METERS),

    /**
     * Plafond par type de lieu. Au-delà de quelques centaines, une carte
     * devient illisible et le rendu des marqueurs s'effondre : le regroupement
     * en grappes serait alors la vraie réponse, pas un plafond plus haut.
     */
    /*
     * Plafond relevé à 1 000.
     *
     * Les 60 par défaut suffisaient à un jeu de démonstration de quelques
     * lieux ; avec près de cinq cents fiches réelles, ils masquaient la
     * majorité de la carte sans que rien ne le signale — l'utilisateur voyait
     * une carte crédible mais incomplète, ce qui est pire qu'une carte vide.
     *
     * Un marqueur pèse environ 150 octets : mille tiennent en 150 Ko, et
     * Leaflet en affiche plusieurs milliers sans peine. Le plafond reste, car
     * une requête sans borne sur une base qui grossit finirait par transférer
     * tout le pays à chaque déplacement.
     */
    limit: z.coerce.number().int().min(1).max(1_000).default(300),
  })
  .superRefine((value, ctx) => {
    const boundsKeys = ['swLat', 'swLng', 'neLat', 'neLng'] as const;
    const providedBounds = boundsKeys.filter((key) => value[key] !== undefined);

    if (providedBounds.length > 0 && providedBounds.length < boundsKeys.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['swLat'],
        message: 'Le cadre doit être complet : swLat, swLng, neLat et neLng.',
      });
    }

    if ((value.latitude === undefined) !== (value.longitude === undefined)) {
      ctx.addIssue({
        code: 'custom',
        path: ['latitude'],
        message: 'latitude et longitude doivent être fournies ensemble.',
      });
    }

    // Le coin sud-ouest doit être au sud du coin nord-est. L'inverse produirait
    // un cadre vide sans lever d'erreur MongoDB.
    if (value.swLat !== undefined && value.neLat !== undefined && value.swLat > value.neLat) {
      ctx.addIssue({
        code: 'custom',
        path: ['swLat'],
        message: 'Le coin sud-ouest doit être au sud du coin nord-est.',
      });
    }
  });

export type MapQuery = z.infer<typeof mapQuerySchema>;
