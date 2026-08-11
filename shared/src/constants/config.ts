import { Currency, Locale } from './enums';

/** Devise et locale par défaut : marché mauritanien au lancement. */
export const DEFAULT_CURRENCY: Currency = Currency.MRU;
export const DEFAULT_LOCALE: Locale = Locale.FR;

/**
 * Pays couverts. L'architecture reste multi-pays : aucun code ne doit supposer
 * un pays unique — toujours filtrer via ce référentiel ou via la donnée.
 */
export const SUPPORTED_COUNTRIES = [
  { code: 'MR', name: 'Mauritanie', currency: Currency.MRU },
] as const;

/** Centre de carte par défaut (Nouakchott) — utilisé uniquement comme viewport initial. */
export const DEFAULT_MAP_CENTER = {
  latitude: 18.0735,
  longitude: -15.9582,
  latitudeDelta: 0.25,
  longitudeDelta: 0.25,
} as const;

export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
} as const;

export const GEO = {
  /** Rayon par défaut d'une recherche « autour de moi », en mètres. */
  DEFAULT_RADIUS_METERS: 10_000,
  MAX_RADIUS_METERS: 200_000,
  EARTH_RADIUS_METERS: 6_378_137,
} as const;

export const REVIEW = {
  MIN_RATING: 1,
  MAX_RATING: 5,
  MAX_COMMENT_LENGTH: 2_000,
  MAX_PHOTOS: 5,
} as const;

export const BOOKING = {
  /** Durée d'un verrouillage temporaire de stock avant confirmation (Phase 8). */
  HOLD_DURATION_MINUTES: 15,
  MAX_NIGHTS: 30,
  MAX_GUESTS: 20,
} as const;

export const UPLOAD = {
  MAX_IMAGE_SIZE_BYTES: 5 * 1024 * 1024,
  ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/webp'] as const,
  MAX_IMAGES_PER_ENTITY: 30,
};
