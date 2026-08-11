import {
  createExcursionBookingSchema,
  excursionBookingListQuerySchema,
} from '@tourism/shared/validation';

import { created, paginated } from '@/lib/api-response';
import { requireAuth } from '@/lib/auth/guard';
import { parseBody, parseQuery, withRoute } from '@/lib/handler';
import {
  createExcursionBooking,
  listExcursionBookings,
} from '@/services/excursion-booking.service';

/** GET /api/excursion-bookings — les siennes ; toutes pour un administrateur. */
export const GET = withRoute(async (request) => {
  const auth = await requireAuth(request);
  const query = parseQuery(request, excursionBookingListQuerySchema);
  const result = await listExcursionBookings(query, auth);
  return paginated(result.items, result.meta);
});

/** POST /api/excursion-bookings */
export const POST = withRoute(async (request) => {
  const auth = await requireAuth(request);
  const input = await parseBody(request, createExcursionBookingSchema);
  return created(await createExcursionBooking(auth.userId, input));
});
