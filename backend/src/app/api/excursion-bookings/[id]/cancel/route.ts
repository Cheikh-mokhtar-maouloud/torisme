import { cancelBookingSchema, objectIdParamSchema } from '@tourism/shared/validation';

import { ok } from '@/lib/api-response';
import { requireAuth } from '@/lib/auth/guard';
import { parseBody, withRoute } from '@/lib/handler';
import { cancelExcursionBooking } from '@/services/excursion-booking.service';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * PATCH /api/excursion-bookings/:id/cancel
 *
 * L'annulation restitue les places à l'excursion, qui redevient réservable si
 * elle était complète.
 */
export const PATCH = withRoute<RouteContext>(async (request, context) => {
  const auth = await requireAuth(request);
  const { id } = objectIdParamSchema.parse(await context.params);
  const { reason } = await parseBody(request, cancelBookingSchema);
  return ok(await cancelExcursionBooking(id, auth, reason));
});
