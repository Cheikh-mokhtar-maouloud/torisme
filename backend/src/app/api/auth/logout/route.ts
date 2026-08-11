import { ok } from '@/lib/api-response';
import { clearSessionCookie } from '@/lib/auth/session';
import { withRoute } from '@/lib/handler';

/**
 * POST /api/auth/logout
 *
 * Efface le cookie de session. Le jeton d'accès reste techniquement valide
 * jusqu'à son expiration (15 min) : sa révocation immédiate suppose une liste
 * de révocation en Redis, prévue en Phase 13.
 */
export const POST = withRoute(async () => {
  const response = ok({ loggedOut: true });
  clearSessionCookie(response);
  return response;
});
