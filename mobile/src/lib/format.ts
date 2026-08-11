import type { Currency } from '@tourism/shared/constants';

/**
 * Formatage localisé.
 *
 * `Intl` plutôt qu'une concaténation manuelle : la MRU s'écrit sans décimale
 * d'usage courant et les séparateurs de milliers varient. `${amount} MRU`
 * afficherait « 18000 MRU » là où on attend « 18 000 MRU ».
 *
 * Hermes embarque `Intl` depuis React Native 0.73 : aucun polyfill nécessaire.
 */
const LOCALE = 'fr-FR';

export function formatMoney(amount: number | undefined, currency: Currency | string): string {
  if (amount === undefined || amount === null) return '—';
  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(value: string | Date | undefined): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium' }).format(new Date(value));
}

export function formatShortDate(value: string | Date | undefined): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short' }).format(
    new Date(value),
  );
}

export function formatDateTime(value: string | undefined): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}

/** 960 → « 16 h » ; 4320 → « 3 j ». */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) return remainingMinutes ? `${hours} h ${remainingMinutes}` : `${hours} h`;

  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours ? `${days} j ${remainingHours} h` : `${days} j`;
}

/** « 2 nuits », « 1 nuit ». Le pluriel français se joue au-delà de 1. */
export function formatNights(nights: number): string {
  return `${nights} nuit${nights > 1 ? 's' : ''}`;
}

export function formatGuests(guests: number): string {
  return `${guests} voyageur${guests > 1 ? 's' : ''}`;
}

/** Date au format attendu par l'API (`YYYY-MM-DD`), en jour calendaire UTC. */
export function toApiDate(date: Date): string {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
    .toISOString()
    .slice(0, 10);
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}
