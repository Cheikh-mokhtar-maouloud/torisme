import { ok } from '@/lib/api-response';
import { requireAuth } from '@/lib/auth/guard';
import { withRoute } from '@/lib/handler';
import { markAllAsRead } from '@/services/notification.service';

/** PATCH /api/notifications/read-all — vide la pastille en une action. */
export const PATCH = withRoute(async (request) => {
  const auth = await requireAuth(request);
  return ok({ marked: await markAllAsRead(auth.userId) });
});
