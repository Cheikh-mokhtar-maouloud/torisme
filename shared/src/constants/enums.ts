/**
 * Énumérations métier partagées par les trois applications.
 *
 * Convention : objets `as const` + type dérivé, plutôt que `enum` TypeScript.
 * Raison : les `enum` ne sont pas effaçables par Babel (Metro / React Native)
 * et produisent du code runtime inutile.
 */

export const UserRole = {
  USER: 'USER',
  ADMIN: 'ADMIN',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

/** Types de lieux réservables ou consultables. Sert aussi de discriminant aux favoris et aux avis. */
export const PlaceType = {
  HOTEL: 'HOTEL',
  RESTAURANT: 'RESTAURANT',
  ATTRACTION: 'ATTRACTION',
  EXCURSION: 'EXCURSION',
} as const;
export type PlaceType = (typeof PlaceType)[keyof typeof PlaceType];

/** Cycle de vie d'une réservation (hôtel ou excursion). */
export const BookingStatus = {
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  CANCELLED: 'CANCELLED',
  COMPLETED: 'COMPLETED',
} as const;
export type BookingStatus = (typeof BookingStatus)[keyof typeof BookingStatus];

/** Statut de publication d'une ressource gérée depuis le dashboard. */
export const ContentStatus = {
  DRAFT: 'DRAFT',
  PUBLISHED: 'PUBLISHED',
  ARCHIVED: 'ARCHIVED',
} as const;
export type ContentStatus = (typeof ContentStatus)[keyof typeof ContentStatus];

export const ExcursionStatus = {
  SCHEDULED: 'SCHEDULED',
  FULL: 'FULL',
  CANCELLED: 'CANCELLED',
  COMPLETED: 'COMPLETED',
} as const;
export type ExcursionStatus = (typeof ExcursionStatus)[keyof typeof ExcursionStatus];

export const PaymentStatus = {
  PENDING: 'PENDING',
  PAID: 'PAID',
  FAILED: 'FAILED',
  REFUNDED: 'REFUNDED',
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const PaymentProvider = {
  STRIPE: 'STRIPE',
  BANKILY: 'BANKILY',
  SEDAD: 'SEDAD',
  CASH: 'CASH',
} as const;
export type PaymentProvider = (typeof PaymentProvider)[keyof typeof PaymentProvider];

export const ReviewStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;
export type ReviewStatus = (typeof ReviewStatus)[keyof typeof ReviewStatus];

export const NotificationType = {
  BOOKING_CONFIRMED: 'BOOKING_CONFIRMED',
  BOOKING_CANCELLED: 'BOOKING_CANCELLED',
  BOOKING_REMINDER: 'BOOKING_REMINDER',
  EXCURSION_UPDATED: 'EXCURSION_UPDATED',
  EXCURSION_REMINDER: 'EXCURSION_REMINDER',
  REVIEW_MODERATED: 'REVIEW_MODERATED',
  SYSTEM: 'SYSTEM',
} as const;
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];

/** Devises supportées. MRU = Ouguiya mauritanienne (devise par défaut du marché initial). */
export const Currency = {
  MRU: 'MRU',
  USD: 'USD',
  EUR: 'EUR',
} as const;
export type Currency = (typeof Currency)[keyof typeof Currency];

export const Locale = {
  FR: 'fr',
  AR: 'ar',
  EN: 'en',
} as const;
export type Locale = (typeof Locale)[keyof typeof Locale];
