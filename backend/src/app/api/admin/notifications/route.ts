import { broadcastNotificationSchema } from '@tourism/shared/validation';

import { created } from '@/lib/api-response';
import { requireAdmin } from '@/lib/auth/guard';
import { parseBody, withRoute } from '@/lib/handler';
import { broadcast } from '@/services/notification.service';

/**
 * POST /api/admin/notifications
 *
 * Diffuse un message. Sans `userIds`, il part à tous les comptes actifs — ce
 * que le dashboard rend explicite, une diffusion générale ne devant jamais
 * résulter d'un champ oublié.
 */
export const POST = withRoute(async (request) => {
  await requireAdmin(request);
  const input = await parseBody(request, broadcastNotificationSchema);
  return created(await broadcast(input));
});
