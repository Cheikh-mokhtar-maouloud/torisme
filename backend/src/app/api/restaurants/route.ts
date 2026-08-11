import { createRestaurantSchema, restaurantListQuerySchema } from '@tourism/shared/validation';

import { created, paginated } from '@/lib/api-response';
import { requireAdmin } from '@/lib/auth/guard';
import { isAdminViewer } from '@/lib/auth/viewer';
import { parseBody, parseQuery, withRoute } from '@/lib/handler';
import { createRestaurant, listRestaurants } from '@/services/restaurant.service';

export const GET = withRoute(async (request) => {
  const query = parseQuery(request, restaurantListQuerySchema);
  const result = await listRestaurants(query, await isAdminViewer(request));
  return paginated(result.items, result.meta);
});

export const POST = withRoute(async (request) => {
  await requireAdmin(request);
  const input = await parseBody(request, createRestaurantSchema);
  return created(await createRestaurant(input));
});
