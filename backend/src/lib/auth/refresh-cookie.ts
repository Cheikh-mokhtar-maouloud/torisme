import type { NextRequest, NextResponse } from 'next/server';

import { isProduction } from '@/config/env';

/**
 * Cookie du jeton de rafraîchissement.
 *
 * Séparé du jeton d'accès : il a une durée de vie bien plus longue et ne doit
 * être envoyé qu'aux routes qui le consomment. `path` le restreint donc à
 * `/api/auth`, ce qui l'exclut de toutes les autres requêtes.
 *
 * L'application mobile n'utilise pas ce cookie et transmet le jeton dans le
 * corps ; c'est le dashboard, côté navigateur, qui en bénéficie.
 */
export const REFRESH_COOKIE = 'tourism_refresh';

const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export function setRefreshCookie(response: NextResponse, token: string): void {
  response.cookies.set(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'lax',
    path: '/api/auth',
    maxAge: MAX_AGE_SECONDS,
  });
}

export function clearRefreshCookie(response: NextResponse): void {
  response.cookies.set(REFRESH_COOKIE, '', {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'lax',
    path: '/api/auth',
    maxAge: 0,
  });
}

/** Le corps de requête prime : c'est la voie de l'application mobile. */
export function readRefreshToken(request: NextRequest, bodyToken?: string): string | undefined {
  return bodyToken ?? request.cookies.get(REFRESH_COOKIE)?.value;
}
