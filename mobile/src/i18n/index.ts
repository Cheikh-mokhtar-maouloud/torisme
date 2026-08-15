/*
 * i18next expose les mêmes fonctions en export nommé et sur son instance par
 * défaut. Le plugin d'import y voit une confusion possible ; ici l'intention
 * est bien d'agir sur l'instance partagée, celle que `react-i18next` lira.
 * Passer par les exports nommés reviendrait au même en masquant sur quoi on
 * agit.
 */
/* eslint-disable import/no-named-as-default-member */
import * as Localization from 'expo-localization';
import i18n from 'i18next';
import { I18nManager } from 'react-native';
import { initReactI18next } from 'react-i18next';

import { LANGUAGES, FALLBACK_LANGUAGE, isSupported, type Language } from './languages';
import ar from './locales/ar.json';
import en from './locales/en.json';
import fr from './locales/fr.json';
import { readStoredLanguage, storeLanguage } from './storage';

export { LANGUAGES, FALLBACK_LANGUAGE, type Language } from './languages';

/**
 * Internationalisation de l'application.
 *
 * Trois langues : français, arabe, anglais. Le choix n'est pas arbitraire pour
 * la Mauritanie — l'arabe est la langue officielle, le français celle de
 * l'administration et du tourisme, l'anglais celle des voyageurs étrangers.
 *
 * ─── L'arabe n'est pas qu'un dictionnaire de plus ───────────────────────────
 *
 * Il s'écrit de droite à gauche. React Native retourne alors l'ensemble de la
 * mise en page : les rangées s'inversent, `marginLeft` devient une marge à
 * droite, les flèches de retour pointent dans l'autre sens. C'est automatique,
 * mais **seulement au démarrage** : le moteur de mise en page lit le sens une
 * fois pour toutes.
 *
 * D'où la contrainte, énoncée dans `setLanguage` : passer à l'arabe depuis le
 * français, ou l'inverse, exige un redémarrage de l'application. Ce n'est pas
 * un défaut d'implémentation qu'on pourrait contourner ; c'est ainsi que
 * fonctionne le moteur.
 *
 * ─── Ce qui ne se vérifie pas dans Expo Go ──────────────────────────────────
 *
 * `forceRTL` agit sur l'**application hôte**. Dans Expo Go, cette application
 * est Expo Go lui-même, qui impose sa propre direction : le texte s'affiche
 * bien en arabe et s'aligne à droite — la bidirectionnalité du moteur de texte
 * s'en charge —, mais la mise en page ne se retourne pas. Les titres restent à
 * gauche, les chevrons pointent toujours dans le même sens.
 *
 * Ce n'est pas un défaut du code : le retournement s'obtient dans une
 * compilation native — `npx expo run:android`, ou une construction EAS —, où
 * l'application est enfin la sienne. C'est aussi la raison d'être du greffon
 * `expo-localization` déclaré dans `app.config.ts`, qui n'a d'effet que là.
 *
 * À vérifier lors de cette première compilation native : les marges nommées
 * `marginLeft` / `marginRight` deviennent `marginStart` / `marginEnd`, et tout
 * style qui aurait codé un côté en dur se retrouvera du mauvais côté.
 */

/**
 * Langue du téléphone, si l'application la parle.
 *
 * Seul le code court est retenu : le système annonce « fr-CA » ou « ar-EG »,
 * et exiger la correspondance exacte ferait retomber sur le français un
 * téléphone réglé en arabe d'Égypte — la langue est pourtant la même à l'écrit.
 */
export function deviceLanguage(): Language {
  const tags = Localization.getLocales();

  for (const tag of tags) {
    const short = tag.languageCode ?? undefined;
    if (isSupported(short)) return short;
  }

  return FALLBACK_LANGUAGE;
}

void i18n.use(initReactI18next).init({
  resources: {
    fr: { translation: fr },
    ar: { translation: ar },
    en: { translation: en },
  },
  lng: deviceLanguage(),
  fallbackLng: FALLBACK_LANGUAGE,
  /*
   * Le français fait aussi office de dernier recours : une clé absente de
   * l'arabe s'affiche en français plutôt qu'en clé brute. Un écran où l'on lit
   * « profile.settings.title » est inutilisable ; le même écran partiellement
   * en français reste utilisable.
   */
  interpolation: {
    // React échappe déjà tout ce qu'il affiche. Le faire une seconde fois
    // transformerait les apostrophes en entités visibles à l'écran.
    escapeValue: false,
  },
  returnNull: false,
});

export default i18n;

/**
 * Applique une langue, et signale si l'application doit redémarrer.
 *
 * Le retour n'est pas un détail d'interface : c'est la seule information dont
 * l'appelant dispose pour savoir s'il doit prévenir l'utilisateur. Basculer
 * silencieusement produirait un écran où le texte est en arabe mais la mise en
 * page toujours de gauche à droite — plus déroutant que la langue d'origine.
 */
export function setLanguage(language: Language): { needsRestart: boolean } {
  const wasRtl = I18nManager.isRTL;
  const willBeRtl = LANGUAGES[language].rtl;

  void i18n.changeLanguage(language);
  void storeLanguage(language);

  if (wasRtl === willBeRtl) return { needsRestart: false };

  /*
   * `allowRTL` avant `forceRTL` : sans la permission, la demande est ignorée
   * sur iOS sans aucun message. Les deux sont retenues par le système et
   * s'appliquent au prochain démarrage.
   */
  I18nManager.allowRTL(willBeRtl);
  I18nManager.forceRTL(willBeRtl);

  return { needsRestart: true };
}

/** Locale à passer à `Intl`, pour les dates et les montants. */
export function currentLocale(): string {
  return LANGUAGES[currentLanguage()].locale;
}

export function currentLanguage(): Language {
  return isSupported(i18n.language) ? i18n.language : FALLBACK_LANGUAGE;
}

/**
 * Restaure la langue mémorisée, avant l'affichage.
 *
 * L'application démarre sur la langue du téléphone ; cet appel la remplace par
 * le choix de l'utilisateur s'il en a fait un. Le faire après le premier rendu
 * produirait un écran brièvement dans la mauvaise langue.
 *
 * Le sens d'écriture, lui, est déjà fixé par le système au lancement — c'est
 * `forceRTL` du choix **précédent** qui l'a établi. Rien à faire ici : y
 * toucher n'aurait aucun effet avant le prochain démarrage.
 */
export async function restoreLanguage(): Promise<void> {
  const stored = await readStoredLanguage();

  if (stored !== null && stored !== i18n.language) {
    await i18n.changeLanguage(stored);
  }
}
