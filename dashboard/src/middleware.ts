import { NextResponse, type NextRequest } from 'next/server';

import { SESSION_COOKIE } from '@/lib/auth/session';

/**
 * Filtre d'entrée : redirige vers la connexion quand aucun cookie de session
 * n'est présent.
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

  if (pathname === '/login') {
    // `?error=` signale une session refusée en aval (jeton expiré, rôle
    // insuffisant). Le cookie est encore présent mais inutilisable : rediriger
    // vers l'accueil produirait une boucle, puisque l'accueil renvoie ici.
    const hasSessionError = request.nextUrl.searchParams.has('error');

    if (hasSession && !hasSessionError) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }

  if (!hasSession) {
    const loginUrl = new URL('/login', request.url);
    // Mémoriser la destination permet d'y revenir après connexion.
    if (pathname !== '/') loginUrl.searchParams.set('from', `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Tout sauf les ressources internes de Next et les fichiers statiques.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)',
  ],
};
