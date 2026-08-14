import { keepPreviousData, useQuery } from '@tanstack/react-query';

import type { PlaceType } from '@tourism/shared/constants';
import type { MapResponse } from '@tourism/shared/types';

import { api, toQuery } from './client';

export interface MapBounds {
  swLat: number;
  swLng: number;
  neLat: number;
  neLng: number;
}

/**
 * Marqueurs du cadre visible.
 *
 * `keepPreviousData` est essentiel ici : sans lui, chaque déplacement de la
 * carte viderait les marqueurs le temps de la requête, produisant un
 * clignotement à chaque geste. Les anciens points restent affichés jusqu'à
 * l'arrivée des nouveaux.
 */
export function useMapMarkers(bounds: MapBounds | null, types: PlaceType[]) {
  return useQuery({
    // Les bornes sont arrondies dans la clé : sans cela, chaque micro-mouvement
    // produirait une clé inédite et donc une requête, alors que le contenu
    // affiché est le même.
    queryKey: ['map', roundBounds(bounds), [...types].sort()],
    queryFn: ({ signal }) =>
      api.get<MapResponse>(
        `/api/map${toQuery({
          ...(bounds
            ? {
                swLat: bounds.swLat,
                swLng: bounds.swLng,
                neLat: bounds.neLat,
                neLng: bounds.neLng,
              }
            : {}),
          ...(types.length > 0 ? { types: types.join(',') } : {}),
          /*
           * La limite s'applique **par catégorie**, non au total : 500 autorise
           * donc 500 hôtels, 500 restaurants et 500 sites. Le pays en compte
           * 472 en tout, la marge est large.
           *
           * Le plafond du schéma est à 1 000. Toute hausse ici doit suivre le
           * déploiement du backend, jamais le précéder : un serveur tolérant
           * devant un client ancien fonctionne, l'inverse renvoie une erreur de
           * validation et la carte affiche « Données invalides » sans que la
           * cause soit devinable.
           */
          limit: 500,
        })}`,
        signal,
      ),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

/** Trois décimales ≈ 100 m : suffisant pour distinguer deux cadres réellement différents. */
function roundBounds(bounds: MapBounds | null): MapBounds | null {
  if (!bounds) return null;
  const round = (value: number) => Math.round(value * 1000) / 1000;
  return {
    swLat: round(bounds.swLat),
    swLng: round(bounds.swLng),
    neLat: round(bounds.neLat),
    neLng: round(bounds.neLng),
  };
}
