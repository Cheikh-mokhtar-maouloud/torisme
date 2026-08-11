import { availabilityQuerySchema, objectIdParamSchema } from '@tourism/shared/validation';

import { ok } from '@/lib/api-response';
import { parseQuery, withRoute } from '@/lib/handler';
import { checkAvailability } from '@/services/booking.service';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/rooms/:id/availability?checkIn=…&checkOut=…
 *
 * Route publique : un visiteur doit pouvoir consulter les disponibilités et le
 * prix total avant de créer un compte.
 */
export const GET = withRoute<RouteContext>(async (request, context) => {
  const { id } = objectIdParamSchema.parse(await context.params);
  const { checkIn, checkOut } = parseQuery(request, availabilityQuerySchema);
  return ok(await checkAvailability(id, checkIn, checkOut));
});
