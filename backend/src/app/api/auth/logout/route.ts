import { ok } from '@/lib/api-response';
import { clearRefreshCookie, readRefreshToken } from '@/lib/auth/refresh-cookie';
import { clearSessionCookie } from '@/lib/auth/session';
import { withRoute } from '@/lib/handler';
import { logout } from '@/services/auth.service';

/**
 * POST /api/auth/logout
 *
 * Efface les cookies et **révoque** le jeton de rafraîchissement. Le jeton
 * d'accès reste techniquement valide jusqu'à son expiration (15 min) : c'est le
 * prix de sa vérification sans aller-retour en base. Le rafraîchissement, lui,
 * est immédiatement inutilisable.
 */
export const POST = withRoute(async (request) => {
  // Le corps est facultatif : le dashboard s'appuie sur le cookie, le mobile
  // transmet explicitement son jeton.
  let bodyToken: string | undefined;
  try {
    const raw = (await request.json()) as { refreshToken?: unknown };
    if (typeof raw?.refreshToken === 'string') bodyToken = raw.refreshToken;
  } catch {
    bodyToken = undefined;
  }

  await logout(readRefreshToken(request, bodyToken));

  const response = ok({ loggedOut: true });
  clearSessionCookie(response);
  clearRefreshCookie(response);
  return response;
});
