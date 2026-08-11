import { NextResponse, type NextRequest } from 'next/server';

/**
 * Contrôle d'origine (CORS) pour l'API.
 *
 * Les variables sont lues directement depuis `process.env` plutôt que via
 * `config/env.ts` : le middleware s'exécute sur chaque requête et le module de
 * configuration valide l'ensemble des secrets, ce qui n'a pas sa place ici.
 *
 * Rappel de portée : CORS est une protection **du navigateur**. L'application
 * mobile n'envoie pas d'en-tête `Origin` et n'y est pas soumise ; le dashboard
 * appelle l'API depuis son serveur, donc sans CORS non plus. Cette couche
 * protège les futurs clients web et empêche un site tiers de faire agir le
 * navigateur d'un utilisateur connecté contre l'API. Elle ne remplace jamais
 * l'autorisation par rôle, qui reste la seule barrière réelle.
 */
function allowedOrigins(): string[] {
  return (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

const ALLOWED_METHODS = 'GET, POST, PUT, PATCH, DELETE, OPTIONS';
const ALLOWED_HEADERS = 'Content-Type, Authorization';
const MAX_AGE_SECONDS = '86400';

export function middleware(request: NextRequest) {
  const origin = request.headers.get('origin');

  // Requête sans origine : appel serveur à serveur, application mobile ou
  // outil en ligne de commande. CORS ne s'applique pas.
  if (!origin) return NextResponse.next();

  const isAllowed = allowedOrigins().includes(origin);

  // Préflight : la réponse doit précéder toute exécution de route.
  if (request.method === 'OPTIONS') {
    if (!isAllowed) {
      // 403 sans en-tête d'autorisation : le navigateur bloquera la requête réelle.
      return new NextResponse(null, { status: 403 });
    }

    return new NextResponse(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': ALLOWED_METHODS,
        'Access-Control-Allow-Headers': ALLOWED_HEADERS,
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Max-Age': MAX_AGE_SECONDS,
        Vary: 'Origin',
      },
    });
  }

  const response = NextResponse.next();

  if (isAllowed) {
    // L'origine est renvoyée telle quelle, jamais `*` : avec
    // `Allow-Credentials: true`, le joker est refusé par les navigateurs et
    // annulerait de toute façon la protection d'origine.
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
  }

  // `Vary: Origin` est indispensable même quand l'origine est refusée : sans
  // lui, un cache pourrait servir à une origine la réponse autorisée d'une autre.
  response.headers.append('Vary', 'Origin');

  return response;
}

export const config = {
  matcher: '/api/:path*',
};
