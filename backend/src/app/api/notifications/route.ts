import { notificationListQuerySchema } from '@tourism/shared/validation';

import { ok } from '@/lib/api-response';
import { requireAuth } from '@/lib/auth/guard';
import { parseQuery, withRoute } from '@/lib/handler';
import { countUnread, listNotifications } from '@/services/notification.service';

/**
 * GET /api/notifications
 *
 * La réponse porte le nombre de non-lues en plus de la page : l'application
 * affiche une pastille à chaque ouverture, et une seconde requête pour un
 * simple compteur serait du gaspillage.
 */
export const GET = withRoute(async (request) => {
  const auth = await requireAuth(request);
  const query = parseQuery(request, notificationListQuerySchema);

  const [result, unreadCount] = await Promise.all([
    listNotifications(auth.userId, query),
    countUnread(auth.userId),
  ]);

  return ok({ items: result.items, meta: result.meta, unreadCount });
});
