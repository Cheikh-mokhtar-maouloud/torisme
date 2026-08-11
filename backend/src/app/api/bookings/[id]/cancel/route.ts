import { cancelBookingSchema, objectIdParamSchema } from '@tourism/shared/validation';

import { ok } from '@/lib/api-response';
import { requireAuth } from '@/lib/auth/guard';
import { parseBody, withRoute } from '@/lib/handler';
import { cancelBooking } from '@/services/booking.service';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * PATCH /api/bookings/:id/cancel
 *
 * PATCH et non DELETE : la réservation n'est pas effacée, son statut change.
 * L'historique doit rester consultable par le client comme par l'administration.
 */
export const PATCH = withRoute<RouteContext>(async (request, context) => {
  const auth = await requireAuth(request);
  const { id } = objectIdParamSchema.parse(await context.params);
  const { reason } = await parseBody(request, cancelBookingSchema);
  return ok(await cancelBooking(id, auth, reason));
});
