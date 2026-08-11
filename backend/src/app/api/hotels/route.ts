import { createHotelSchema, hotelListQuerySchema } from '@tourism/shared/validation';

import { created, paginated } from '@/lib/api-response';
import { requireAdmin } from '@/lib/auth/guard';
import { isAdminViewer } from '@/lib/auth/viewer';
import { parseBody, parseQuery, withRoute } from '@/lib/handler';
import { createHotel, listHotels } from '@/services/hotel.service';

/** GET /api/hotels — liste publique, paginée et filtrable. */
export const GET = withRoute(async (request) => {
  const query = parseQuery(request, hotelListQuerySchema);
  const result = await listHotels(query, await isAdminViewer(request));
  return paginated(result.items, result.meta);
});

/** POST /api/hotels — réservé aux administrateurs. */
export const POST = withRoute(async (request) => {
  await requireAdmin(request);
  const input = await parseBody(request, createHotelSchema);
  return created(await createHotel(input));
});
