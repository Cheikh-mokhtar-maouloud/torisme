import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';

import { isProduction } from '@/config/env';

/**
 * Le jeton voyage de deux façons selon le client :
 *
 * - **Dashboard** : cookie HTTP-only, inaccessible au JavaScript de la page,
 *   ce qui neutralise le vol de jeton par XSS.
 * - **Mobile** : en-tête `Authorization: Bearer`, car React Native ne dispose
 *   pas d'un magasin à cookies fiable ; le jeton y est stocké dans le trousseau
 *   sécurisé de l'appareil.
 *
 * Les deux transports sont acceptés en lecture ; le cookie a la priorité.
 */
export const SESSION_COOKIE = 'tourism_session';

export function extractToken(request: NextRequest): string | null {
  const cookieToken = request.cookies.get(SESSION_COOKIE)?.value;
  if (cookieToken) return cookieToken;

  const header = request.headers.get('authorization');
  if (header?.toLowerCase().startsWith('bearer ')) {
    const token = header.slice(7).trim();
    if (token) return token;
  }

  return null;
}

/** Durée de vie du cookie, alignée sur celle du jeton d'accès. */
const COOKIE_MAX_AGE_SECONDS = 15 * 60;

export function setSessionCookie(response: NextResponse, token: string): void {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    // `Secure` est désactivé en développement, sinon le navigateur refuse le
    // cookie sur http://localhost et la connexion échoue sans message clair.
    secure: isProduction(),
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}
