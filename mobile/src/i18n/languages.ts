/**
 * Langues prises en charge.
 *
 * Dans un module à part, et non dans `index.ts`, pour rompre un cycle : le
 * stockage a besoin de cette liste pour valider ce qu'il relit, et `index.ts` a
 * besoin du stockage pour restaurer le choix. Chacun important l'autre, la
 * liste pouvait n'être pas encore initialisée au moment où le stockage la
 * lisait — l'erreur était alors avalée par son `catch`, et la langue choisie
 * paraissait simplement ne jamais être retenue.
 *
 * Un module sans dépendance, importé par les deux, supprime la question.
 *
 * Le choix des trois langues n'est pas arbitraire pour la Mauritanie : l'arabe
 * est la langue officielle, le français celle de l'administration et du
 * tourisme, l'anglais celle des voyageurs étrangers.
 */
export const LANGUAGES = {
  fr: { label: 'Français', rtl: false, locale: 'fr-FR' },
  ar: { label: 'العربية', rtl: true, locale: 'ar-MR' },
  en: { label: 'English', rtl: false, locale: 'en-GB' },
} as const;

export type Language = keyof typeof LANGUAGES;

export const FALLBACK_LANGUAGE: Language = 'fr';

export function isSupported(tag: string | undefined | null): tag is Language {
  return typeof tag === 'string' && tag in LANGUAGES;
}
