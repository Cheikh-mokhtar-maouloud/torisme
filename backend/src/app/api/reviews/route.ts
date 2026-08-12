import { createReviewSchema, reviewListQuerySchema } from '@tourism/shared/validation';

import { created, paginated } from '@/lib/api-response';
import { requireAuth } from '@/lib/auth/guard';
import { optionalAuth } from '@/lib/auth/guard';
import { parseBody, parseQuery, withRoute } from '@/lib/handler';
import { createReview, listReviews } from '@/services/review.service';

/**
 * GET /api/reviews
 *
 * Publique : seuls les avis approuvés sortent. Un administrateur voit tous les
 * statuts, et `scope=me` renvoie ses propres avis quel que soit le leur — un
 * auteur doit pouvoir constater que son avis attend encore la modération.
 */
export const GET = withRoute(async (request) => {
  const auth = await optionalAuth(request);
  const query = parseQuery(request, reviewListQuerySchema);
  const result = await listReviews(query, auth);
  return paginated(result.items, result.meta);
});

/** POST /api/reviews */
export const POST = withRoute(async (request) => {
  const auth = await requireAuth(request);
  const input = await parseBody(request, createReviewSchema);
  return created(await createReview(auth.userId, input));
});
