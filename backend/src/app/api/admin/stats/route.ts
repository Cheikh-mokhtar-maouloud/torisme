import { ok } from '@/lib/api-response';
import { requireAdmin } from '@/lib/auth/guard';
import { withRoute } from '@/lib/handler';
import { getPlatformStats } from '@/services/stats.service';

/** GET /api/admin/stats — compteurs de l'écran d'accueil du dashboard. */
export const GET = withRoute(async (request) => {
  await requireAdmin(request);
  return ok(await getPlatformStats());
});
