import type { ErrorCode } from '../constants/api';
import type { Currency } from '../constants/enums';

/** Identifiant MongoDB sérialisé en chaîne dans toutes les réponses API. */
export type Id = string;

/** Date sérialisée en ISO 8601 (JSON ne transporte pas d'objet Date). */
export type IsoDate = string;

export interface Timestamps {
  createdAt: IsoDate;
  updatedAt: IsoDate;
}

/** Point GeoJSON tel que stocké dans MongoDB : [longitude, latitude] — dans cet ordre. */
export interface GeoPoint {
  type: 'Point';
  coordinates: [longitude: number, latitude: number];
}

export interface Address {
  line1?: string;
  city: string;
  region?: string;
  country: string;
  countryCode: string;
  postalCode?: string;
}

export interface ImageRef {
  url: string;
  /** Identifiant chez le fournisseur de stockage (Cloudinary public_id, clé S3…). */
  providerId?: string;
  alt?: string;
  width?: number;
  height?: number;
  /** Position dans la galerie ; la position 0 est l'image principale. */
  order: number;
}

export interface Money {
  amount: number;
  currency: Currency;
}

/* ------------------------------------------------------------------ */
/* Enveloppes de réponse API                                           */
/* ------------------------------------------------------------------ */

export interface ApiError {
  code: ErrorCode;
  message: string;
  /** Erreurs par champ, renvoyées par la validation Zod. */
  fields?: Record<string, string[]>;
}

export type ApiResponse<T> = { success: true; data: T } | { success: false; error: ApiError };

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
}

export interface Paginated<T> {
  items: T[];
  meta: PaginationMeta;
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
}

export interface SortQuery {
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/** Filtre géographique « autour d'un point ». */
export interface GeoQuery {
  latitude?: number;
  longitude?: number;
  radiusMeters?: number;
}
