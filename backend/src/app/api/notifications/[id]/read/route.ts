import { objectIdParamSchema } from '@tourism/shared/validation';

import { ok } from '@/lib/api-response';
import { requireAuth } from '@/lib/auth/guard';
import { withRoute } from '@/lib/handler';
import { markAsRead } from '@/services/notification.service';

type RouteContext = { params: Promise<{ id: string }> };

export const PATCH = withRoute<RouteContext>(async (request, context) => {
  const auth = await requireAuth(request);
  const { id } = objectIdParamSchema.parse(await context.params);
  return ok(await markAsRead(id, auth.userId));
});
