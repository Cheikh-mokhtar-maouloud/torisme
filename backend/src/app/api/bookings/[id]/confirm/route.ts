import { objectIdParamSchema } from '@tourism/shared/validation';

import { ok } from '@/lib/api-response';
import { requireAdmin } from '@/lib/auth/guard';
import { withRoute } from '@/lib/handler';
import { confirmBooking } from '@/services/booking.service';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * PATCH /api/bookings/:id/confirm
 *
 * Réservé aux administrateurs : la confirmation engage l'établissement, elle ne
 * peut pas venir du client qui a fait la demande.
 */
export const PATCH = withRoute<RouteContext>(async (request, context) => {
  await requireAdmin(request);
  const { id } = objectIdParamSchema.parse(await context.params);
  return ok(await confirmBooking(id));
});
