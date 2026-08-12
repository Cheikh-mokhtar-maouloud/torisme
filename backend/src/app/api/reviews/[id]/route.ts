import { objectIdParamSchema } from '@tourism/shared/validation';

import { ok } from '@/lib/api-response';
import { requireAuth } from '@/lib/auth/guard';
import { withRoute } from '@/lib/handler';
import { deleteReview } from '@/services/review.service';

type RouteContext = { params: Promise<{ id: string }> };

/** DELETE — son propre avis, ou n'importe lequel pour un administrateur. */
export const DELETE = withRoute<RouteContext>(async (request, context) => {
  const auth = await requireAuth(request);
  const { id } = objectIdParamSchema.parse(await context.params);
  await deleteReview(id, auth);
  return ok({ deleted: true });
});
