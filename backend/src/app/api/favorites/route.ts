import { createFavoriteSchema, favoriteListQuerySchema } from '@tourism/shared/validation';

import { created, ok, paginated } from '@/lib/api-response';
import { requireAuth } from '@/lib/auth/guard';
import { parseBody, parseQuery, withRoute } from '@/lib/handler';
import { addFavorite, listFavorites, removeFavorite } from '@/services/favorite.service';

/** GET /api/favorites — favoris de l'utilisateur, enrichis de leur cible. */
export const GET = withRoute(async (request) => {
  const auth = await requireAuth(request);
  const query = parseQuery(request, favoriteListQuerySchema);
  const result = await listFavorites(auth.userId, query);
  return paginated(result.items, result.meta);
});

/** POST /api/favorites — idempotent : rajouter un favori existant le renvoie. */
export const POST = withRoute(async (request) => {
  const auth = await requireAuth(request);
  const input = await parseBody(request, createFavoriteSchema);
  return created(await addFavorite(auth.userId, input));
});

/**
 * DELETE /api/favorites?targetType=…&targetId=…
 *
 * La cible est désignée par son couple type/identifiant plutôt que par
 * l'identifiant du favori : l'application connaît le lieu affiché, pas l'entrée
 * de favori, et devrait sinon la retrouver d'abord.
 */
export const DELETE = withRoute(async (request) => {
  const auth = await requireAuth(request);
  const { targetType, targetId } = parseQuery(request, createFavoriteSchema);
  await removeFavorite(auth.userId, targetType, targetId);
  return ok({ removed: true });
});
