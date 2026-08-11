import { bookingListQuerySchema, createBookingSchema } from '@tourism/shared/validation';

import { created, paginated } from '@/lib/api-response';
import { requireAuth } from '@/lib/auth/guard';
import { parseBody, parseQuery, withRoute } from '@/lib/handler';
import { createBooking, listBookings } from '@/services/booking.service';

/** GET /api/bookings — ses propres réservations ; toutes pour un administrateur. */
export const GET = withRoute(async (request) => {
  const auth = await requireAuth(request);
  const query = parseQuery(request, bookingListQuerySchema);
  const result = await listBookings(query, auth);
  return paginated(result.items, result.meta);
});

/** POST /api/bookings */
export const POST = withRoute(async (request) => {
  const auth = await requireAuth(request);
  const input = await parseBody(request, createBookingSchema);
  return created(await createBooking(auth.userId, input));
});
