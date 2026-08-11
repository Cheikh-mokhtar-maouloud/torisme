import type { Currency } from '@tourism/shared/constants';

/**
 * Formatage localisé.
 *
 * `Intl` est utilisé plutôt qu'un formatage manuel : la MRU n'a pas de décimale
 * d'usage courant, et les séparateurs de milliers diffèrent selon la locale.
 * Écrire `${amount} MRU` produirait « 18000 MRU » là où on attend « 18 000 MRU ».
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

export function formatNumber(value: number): string {
  return new Intl.NumberFormat(LOCALE).format(value);
}

export function formatDate(iso: string | undefined): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium' }).format(new Date(iso));
}

export function formatDateTime(iso: string | undefined): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(iso),
  );
}

/** Durée en minutes vers une forme lisible : 960 → « 16 h ». */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;

  if (hours < 24) return remaining ? `${hours} h ${remaining} min` : `${hours} h`;

  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours ? `${days} j ${remainingHours} h` : `${days} j`;
}

/** Coupe un texte long pour une cellule de tableau, sans casser un mot en deux. */
export function truncate(value: string, maxLength = 80): string {
  if (value.length <= maxLength) return value;
  const cut = value.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(' ');
  return `${lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut}…`;
}
