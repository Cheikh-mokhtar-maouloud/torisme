import { NextResponse, type NextRequest } from 'next/server';

import { SESSION_COOKIE } from '@/lib/auth/session';
import { contentSecurityPolicy, staticSecurityHeaders } from '@/lib/security-headers';

/**
 * Filtre d'entrée : applique les en-têtes de sécurité, puis redirige vers la
 * connexion quand aucun cookie de session n'est présent.
 *
 * Les en-têtes sont posés **ici** plutôt que dans `next.config.ts` parce que la
 * CSP repose sur un nonce, qui doit être régénéré à chaque réponse. Un nonce
 * figé dans la configuration serait constant pour toutes les requêtes et pour
 * tous les visiteurs, donc devinable — c'est-à-dire sans valeur.
 *
 * Il ne vérifie **pas** la validité du jeton. Le middleware s'exécute sur
 * chaque requête, y compris pour les ressources statiques : y placer un appel
 * réseau au backend en ferait un goulot d'étranglement. L'autorisation réelle
 * a lieu dans le layout protégé, puis à nouveau côté API — un cookie forgé ne
 * donne accès à rien.
 */
export function middleware(request: NextRequest) {
  const hasSession = request.cookies.has(SESSION_COOKIE);
  const { pathname, search } = request.nextUrl;

  /*
   * 128 bits d'aléa cryptographique. `Math.random()` conviendrait pour un
   * identifiant d'affichage mais pas ici : sa suite est prédictible à partir de
   * quelques valeurs observées, et un nonce prédictible s'écrit dans le script
   * injecté, ce qui annule complètement la CSP.
   */
  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64');

  if (pathname === '/login') {
    // `?error=` signale une session refusée en aval (jeton expiré, rôle
    // insuffisant). Le cookie est encore présent mais inutilisable : rediriger
    // vers l'accueil produirait une boucle, puisque l'accueil renvoie ici.
    const hasSessionError = request.nextUrl.searchParams.has('error');

    if (hasSession && !hasSessionError) {
      return harden(NextResponse.redirect(new URL('/', request.url)), nonce);
    }
    return harden(withNonce(request, nonce), nonce);
  }

  if (!hasSession) {
    const loginUrl = new URL('/login', request.url);
    // Mémoriser la destination permet d'y revenir après connexion.
    if (pathname !== '/') loginUrl.searchParams.set('from', `${pathname}${search}`);
    return harden(NextResponse.redirect(loginUrl), nonce);
  }

  return harden(withNonce(request, nonce), nonce);
}

/**
 * Transmet le nonce au rendu.
 *
 * Next lit l'en-tête `x-nonce` de la requête entrante pour l'apposer sur ses
 * propres balises `<script>`. Sans cette réécriture, les scripts de Next
 * n'auraient pas le nonce que la CSP exige et la page resterait blanche —
 * l'échec typique d'une CSP par nonce mal câblée.
 */
function withNonce(request: NextRequest, nonce: string): NextResponse {
  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);
  return NextResponse.next({ request: { headers } });
}

/** Applique la CSP et les en-têtes constants à une réponse. */
function harden(response: NextResponse, nonce: string): NextResponse {
  const isProduction = process.env.NODE_ENV === 'production';

  response.headers.set('Content-Security-Policy', contentSecurityPolicy(nonce, isProduction));

  for (const [name, value] of Object.entries(staticSecurityHeaders(isProduction))) {
    response.headers.set(name, value);
  }

  return response;
}

export const config = {
  matcher: [
    // Tout sauf les ressources internes de Next et les fichiers statiques.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)',
  ],
};
