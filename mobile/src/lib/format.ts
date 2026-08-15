import type { Currency } from '@tourism/shared/constants';

import i18n, { currentLocale } from '../i18n';

/**
 * Formatage localisé.
 *
 * `Intl` plutôt qu'une concaténation manuelle : la MRU s'écrit sans décimale
 * d'usage courant et les séparateurs de milliers varient. `${amount} MRU`
 * afficherait « 18000 MRU » là où on attend « 18 000 MRU ».
 *
 * Hermes embarque `Intl` depuis React Native 0.73 : aucun polyfill nécessaire.
 *
 * La locale est **lue à chaque appel**, et non figée dans une constante : elle
 * change avec la langue choisie, et une valeur capturée au chargement du module
 * afficherait indéfiniment des dates en français dans une interface en arabe.
 */
const LOCALE = () => currentLocale();

export function formatMoney(amount: number | undefined, currency: Currency | string): string {
  if (amount === undefined || amount === null) return '—';
  return new Intl.NumberFormat(LOCALE(), {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(value: string | Date | undefined): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat(LOCALE(), { dateStyle: 'medium' }).format(new Date(value));
}

export function formatShortDate(value: string | Date | undefined): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat(LOCALE(), { day: 'numeric', month: 'short' }).format(
    new Date(value),
  );
}

export function formatDateTime(value: string | undefined): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat(LOCALE(), { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}

/**
 * 960 → « 16 h » ; 4320 → « 3 j ».
 *
 * Les abréviations d'unité sont traduites : « h » et « j » ne veulent rien dire
 * en arabe, et l'anglais écrit « d » là où le français écrit « j ».
 */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return i18n.t('units.minutes', { count: minutes });

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours < 24) {
    return remainingMinutes
      ? i18n.t('units.hoursMinutes', { count: hours, minutes: remainingMinutes })
      : i18n.t('units.hours', { count: hours });
  }

  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;

  return remainingHours
    ? i18n.t('units.daysHours', { count: days, hours: remainingHours })
    : i18n.t('units.days', { count: days });
}

/**
 * « 2 nuits », « 1 nuit », « ليلتان ».
 *
 * Le pluriel est délégué à i18next, et non calculé ici par un `s` conditionnel.
 * Ce raccourci ne vaut que pour le français et l'anglais : l'arabe distingue
 * **six** formes — zéro, un, deux, quelques, plusieurs, autre — et « ليلتان »,
 * le duel, n'est ni le singulier ni le pluriel. Aucune règle écrite à la main
 * ne rendrait cela correctement.
 */
export function formatNights(nights: number): string {
  return i18n.t('units.nights', { count: nights });
}

export function formatGuests(guests: number): string {
  return i18n.t('units.guests', { count: guests });
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
