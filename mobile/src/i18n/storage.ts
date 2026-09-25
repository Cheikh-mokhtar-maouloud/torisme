import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { isSupported, type Language } from './languages';

/**
 * Mémorisation de la langue choisie.
 *
 * `SecureStore` n'est pas le rangement naturel d'une préférence — rien ici
 * n'est confidentiel. Il est retenu parce que l'application l'utilise déjà pour
 * le jeton de session : ajouter `AsyncStorage` pour une seule chaîne
 * introduirait une dépendance et un second mécanisme de persistance à
 * maintenir, pour un gain nul.
 *
 * Le web n'en dispose pas ; la langue y retombe alors sur celle du navigateur à
 * chaque visite. C'est acceptable : le web n'est pas la cible de cette
 * application.
 */

const KEY = 'app.language';

const isAvailable = Platform.OS === 'ios' || Platform.OS === 'android';

export async function readStoredLanguage(): Promise<Language | null> {
  if (!isAvailable) return null;

  try {
    const value = await SecureStore.getItemAsync(KEY);
    /*
     * La valeur lue est vérifiée contre les langues connues, et pas seulement
     * contre `null`. Une version future qui retirerait une langue trouverait
     * sinon un code orphelin et afficherait des clés brutes.
     */
    return isSupported(value) ? value : null;
  } catch {
    // Un magasin illisible ne doit pas empêcher l'application de démarrer :
    // la langue du téléphone prendra le relais.
    return null;
  }
}

export async function storeLanguage(language: Language): Promise<void> {
  if (!isAvailable) return;

  try {
    await SecureStore.setItemAsync(KEY, language);
  } catch {
    // Échec silencieux : le choix vaut pour la session en cours, il ne sera
    // simplement pas retrouvé au prochain lancement. Interrompre l'utilisateur
    // pour cela serait disproportionné.
  }
}
