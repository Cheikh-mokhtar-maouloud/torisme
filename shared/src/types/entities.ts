/**
 * Formes des entités telles qu'exposées par l'API (DTO, pas documents Mongoose).
 *
 * Ces types décrivent le contrat client. Les schémas Mongoose vivent dans
 * `backend/src/models` et seront alignés sur ces types en Phase 2.
 */

import type {
  BookingStatus,
  ContentStatus,
  Currency,
  ExcursionStatus,
  NotificationType,
  PaymentProvider,
  PaymentStatus,
  PlaceType,
  ReviewStatus,
  UserRole,
} from '../constants/enums';
import type { Address, GeoPoint, Id, ImageRef, IsoDate, Timestamps } from './common';

export interface User extends Timestamps {
  id: Id;
  fullName: string;
  email: string;
  phone?: string;
  avatarUrl?: string;
  role: UserRole;
  isActive: boolean;
  emailVerifiedAt?: IsoDate;
}

export interface Category extends Timestamps {
  id: Id;
  name: string;
  slug: string;
  /** Type de lieu auquel la catégorie s'applique (une catégorie « Plage » cible ATTRACTION). */
  appliesTo: PlaceType;
  iconUrl?: string;
  isActive: boolean;
}

/** Champs communs à tout lieu affichable sur la carte. */
export interface PlaceBase extends Timestamps {
  id: Id;
  name: string;
  description: string;
  address: Address;
  location: GeoPoint;
  images: ImageRef[];
  rating: number;
  reviewCount: number;
  status: ContentStatus;
}

export interface Hotel extends PlaceBase {
  stars?: number;
  amenities: string[];
  rules?: string[];
  checkInTime: string;
  checkOutTime: string;
  phone?: string;
  /** Prix de la chambre la moins chère — dénormalisé pour trier les listes sans jointure. */
  minPricePerNight?: number;
  currency: Currency;
}

export interface Room extends Timestamps {
  id: Id;
  hotelId: Id;
  name: string;
  description: string;
  images: ImageRef[];
  capacity: number;
  bedCount: number;
  amenities: string[];
  pricePerNight: number;
  currency: Currency;
  /** Nombre d'unités physiques de ce type de chambre dans l'hôtel. */
  totalUnits: number;
  status: ContentStatus;
}

export interface Restaurant extends PlaceBase {
  cuisineTypes: string[];
  priceRange: 1 | 2 | 3 | 4;
  phone?: string;
  openingHours?: OpeningHours;
  menuUrl?: string;
  categoryIds: Id[];
}

export interface Attraction extends PlaceBase {
  categoryIds: Id[];
  openingHours?: OpeningHours;
  entryFee?: number;
  currency?: Currency;
}

/** Horaires par jour de semaine (0 = dimanche), plusieurs créneaux possibles. */
export type OpeningHours = Record<string, Array<{ open: string; close: string }>>;

export interface Excursion extends Timestamps {
  id: Id;
  title: string;
  description: string;
  images: ImageRef[];
  destination: string;
  departureLocation: GeoPoint;
  departureAddress: Address;
  /** Programme horaire de la journée. */
  itinerary: Array<{ time?: string; title: string; description?: string }>;
  durationMinutes: number;
  startsAt: IsoDate;
  price: number;
  currency: Currency;
  totalSeats: number;
  availableSeats: number;
  guideName?: string;
  status: ExcursionStatus;
  rating: number;
  reviewCount: number;
}

export interface Booking extends Timestamps {
  id: Id;
  reference: string;
  userId: Id;
  hotelId: Id;
  roomId: Id;
  checkIn: IsoDate;
  checkOut: IsoDate;
  nights: number;
  guests: number;
  unitPrice: number;
  totalPrice: number;
  currency: Currency;
  status: BookingStatus;
  cancelledAt?: IsoDate;
  cancellationReason?: string;
}

export interface ExcursionBooking extends Timestamps {
  id: Id;
  reference: string;
  userId: Id;
  excursionId: Id;
  seats: number;
  unitPrice: number;
  totalPrice: number;
  currency: Currency;
  status: BookingStatus;
  cancelledAt?: IsoDate;
}

export interface Review extends Timestamps {
  id: Id;
  userId: Id;
  targetType: PlaceType;
  targetId: Id;
  /** Réservation justifiant l'avis — requise pour les types réservables (anti faux avis). */
  bookingId?: Id;
  rating: number;
  comment?: string;
  images: ImageRef[];
  status: ReviewStatus;
  /** Date de la décision de modération, absente tant que l'avis est en attente. */
  moderatedAt?: IsoDate;
  /** Motif interne de rejet, jamais exposé à l'auteur pour l'instant. */
  moderationReason?: string;
  reportCount: number;
}

export interface Favorite extends Timestamps {
  id: Id;
  userId: Id;
  targetType: PlaceType;
  targetId: Id;
}

export interface Notification extends Timestamps {
  id: Id;
  userId: Id;
  type: NotificationType;
  title: string;
  body: string;
  /** Charge utile de navigation (ex. { bookingId }) pour le deep-link côté mobile. */
  data?: Record<string, string>;
  readAt?: IsoDate;
}

export interface Payment extends Timestamps {
  id: Id;
  bookingId: Id;
  userId: Id;
  amount: number;
  currency: Currency;
  provider: PaymentProvider;
  transactionId?: string;
  status: PaymentStatus;
}
