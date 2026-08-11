import type { Currency, PlaceType } from '../constants/enums';
import type { Id } from './common';

/**
 * Marqueur de carte : forme commune à tous les types de lieux.
 *
 * Volontairement plat et minimal. Une carte affiche des dizaines de points à la
 * fois ; y transporter la description complète et toutes les images de chaque
 * fiche multiplierait la charge utile pour un contenu que l'utilisateur ne voit
 * pas. La fiche complète est chargée à l'ouverture du détail.
 */
export interface MapMarker {
  id: Id;
  type: PlaceType;
  name: string;
  city: string;
  /** Coordonnées en degrés décimaux, dans l'ordre attendu par les cartes. */
  latitude: number;
  longitude: number;
  rating: number;
  reviewCount: number;
  /** Vignette : première image de la fiche, absente si aucune photo. */
  imageUrl?: string;
  /** Prix indicatif : nuitée pour un hôtel, entrée pour une attraction, place pour une excursion. */
  price?: number;
  currency?: Currency;
  /** Distance au point interrogé, en mètres. Présente uniquement en mode « autour de moi ». */
  distanceMeters?: number;
}

export interface MapResponse {
  markers: MapMarker[];
  /** Nombre de marqueurs par type, pour afficher les compteurs des filtres. */
  countsByType: Record<string, number>;
  /** Vrai si un plafond a été atteint : la carte doit inviter à zoomer. */
  truncated: boolean;
}
