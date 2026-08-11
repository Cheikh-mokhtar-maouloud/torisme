import 'server-only';

import { cookies } from 'next/headers';

import { config } from '../config';

/**
 * Session du dashboard.
 *
 * Le jeton émis par le backend est stocké dans un cookie posé par **le
 * dashboard sur son propre domaine**, jamais transmis au navigateur autrement.
 * Deux conséquences voulues :
 *
 * - aucun échange de cookie inter-domaines, donc pas de CORS avec credentials
 *   ni de `SameSite=None` en production ;
 * - le jeton reste hors de portée du JavaScript de la page, ce qui neutralise
 *   son vol par XSS.
 */
const SESSION_COOKIE = 'dashboard_session';

/** Aligné sur la durée de vie du jeton d'accès émis par le backend. */
const MAX_AGE_SECONDS = 15 * 60;

export async function getSessionToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value;
}

export async function setSessionToken(token: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    // Désactivé en développement : le navigateur refuserait un cookie `Secure`
    // sur http://localhost, et la connexion échouerait sans message explicite.
    secure: config.isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function clearSessionToken(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export { SESSION_COOKIE };
