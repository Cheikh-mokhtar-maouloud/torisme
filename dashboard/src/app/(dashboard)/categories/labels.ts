import { PlaceType } from '@tourism/shared/constants';

/**
 * Libellés des types de lieux.
 *
 * Ce module est séparé de `actions.ts` : un fichier marqué `'use server'` ne
 * peut exporter que des fonctions asynchrones, jamais une constante.
 */
export const PLACE_TYPE_LABELS: Record<string, string> = {
  [PlaceType.HOTEL]: 'Hôtels',
  [PlaceType.RESTAURANT]: 'Restaurants',
  [PlaceType.ATTRACTION]: 'Attractions',
  [PlaceType.EXCURSION]: 'Excursions',
};

export const PLACE_TYPE_OPTIONS = Object.entries(PLACE_TYPE_LABELS).map(([value, label]) => ({
  value,
  label,
}));
