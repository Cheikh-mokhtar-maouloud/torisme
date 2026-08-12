import { moderateReviewSchema, objectIdParamSchema } from '@tourism/shared/validation';

import { ok } from '@/lib/api-response';
import { requireAdmin } from '@/lib/auth/guard';
import { parseBody, withRoute } from '@/lib/handler';
import { moderateReview } from '@/services/review.service';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * PATCH /api/reviews/:id/moderate
 *
 * Approuve ou rejette un avis, puis recalcule la note du lieu concerné.
 */
export const PATCH = withRoute<RouteContext>(async (request, context) => {
  await requireAdmin(request);
  const { id } = objectIdParamSchema.parse(await context.params);
  const input = await parseBody(request, moderateReviewSchema);
  return ok(await moderateReview(id, input));
});
