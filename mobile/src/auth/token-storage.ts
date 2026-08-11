import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Stockage du jeton de session.
 *
 * `expo-secure-store` s'appuie sur le trousseau iOS et le Keystore Android :
 * le jeton est chiffré au repos et inaccessible aux autres applications.
 * `AsyncStorage` le laisserait en clair dans le bac à sable de l'application,
 * lisible sur un appareil rooté ou depuis une sauvegarde.
 *
 * Le web n'a pas d'équivalent : `SecureStore` y est indisponible et le jeton
 * n'est donc pas persisté. C'est volontaire — la cible du projet est mobile,
 * et le web ne sert qu'à la mise au point.
 */
const TOKEN_KEY = 'tourism_session_token';

const isSecureStoreAvailable = Platform.OS === 'ios' || Platform.OS === 'android';

/**
 * Copie en mémoire, pour éviter une lecture du trousseau à chaque requête.
 * `undefined` signifie « pas encore lu », `null` « lu et absent ».
 */
let cachedToken: string | null | undefined;

export async function getStoredToken(): Promise<string | null> {
  if (cachedToken !== undefined) return cachedToken;

  if (!isSecureStoreAvailable) {
    cachedToken = null;
    return null;
  }

  try {
    cachedToken = await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    // Trousseau illisible (appareil verrouillé au démarrage, par exemple) :
    // traiter comme une absence de session plutôt que planter l'application.
    cachedToken = null;
  }

  return cachedToken;
}

export async function storeToken(token: string): Promise<void> {
  cachedToken = token;
  if (!isSecureStoreAvailable) return;
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearStoredToken(): Promise<void> {
  cachedToken = null;
  if (!isSecureStoreAvailable) return;
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}
