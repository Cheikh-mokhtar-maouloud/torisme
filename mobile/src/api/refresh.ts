import type { User } from '@tourism/shared/types';

import { appConfig } from '../config/env';
import {
  clearStoredToken,
  getStoredRefreshToken,
  storeRefreshToken,
  storeToken,
} from '../auth/token-storage';

interface AuthResult {
  user: User;
  token: string;
  refreshToken: string;
}

/**
 * Renouvellement du jeton d'accès.
 *
 * Le jeton d'accès dure 15 minutes. Sans ce mécanisme, l'utilisateur était
 * déconnecté en pleine navigation — défaut introduit en Phase 5, corrigé ici.
 *
 * Le renouvellement est **partagé** : si trois requêtes échouent en même temps
 * sur un jeton expiré, elles attendent toutes le même appel. Sans cette mise en
 * commun, chacune consommerait un jeton de rafraîchissement, et la rotation
 * côté serveur invaliderait les autres — la session serait perdue précisément
 * au moment où on cherche à la préserver.
 */
let pendingRefresh: Promise<string | null> | null = null;

export function refreshAccessToken(): Promise<string | null> {
  pendingRefresh ??= performRefresh().finally(() => {
    pendingRefresh = null;
  });

  return pendingRefresh;
}

async function performRefresh(): Promise<string | null> {
  const refreshToken = await getStoredRefreshToken();
  if (!refreshToken) return null;

  let response: Response;

  try {
    response = await fetch(`${appConfig.apiUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
  } catch {
    // Panne réseau : surtout ne pas effacer la session. L'utilisateur retrouvera
    // sa session au retour de la connexion.
    return null;
  }

  if (!response.ok) {
    // Jeton refusé : expiré, révoqué, ou rejoué. La session est bel et bien
    // terminée — on nettoie pour que l'application repasse en mode déconnecté.
    await clearStoredToken();
    return null;
  }

  const payload = (await response.json()) as { success: boolean; data?: AuthResult };
  if (!payload.success || !payload.data) {
    await clearStoredToken();
    return null;
  }

  await storeToken(payload.data.token);
  await storeRefreshToken(payload.data.refreshToken);

  return payload.data.token;
}
