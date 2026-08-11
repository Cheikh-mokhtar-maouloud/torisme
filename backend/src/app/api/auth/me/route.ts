import { ok } from '@/lib/api-response';
import { requireAuth } from '@/lib/auth/guard';
import { withRoute } from '@/lib/handler';
import { getCurrentUser } from '@/services/auth.service';

/** GET /api/auth/me — profil de l'utilisateur authentifié. */
export const GET = withRoute(async (request) => {
  const auth = await requireAuth(request);
  return ok(await getCurrentUser(auth.userId));
});
