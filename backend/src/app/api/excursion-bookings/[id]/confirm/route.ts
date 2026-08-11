import { objectIdParamSchema } from '@tourism/shared/validation';

import { ok } from '@/lib/api-response';
import { requireAdmin } from '@/lib/auth/guard';
import { withRoute } from '@/lib/handler';
import { confirmExcursionBooking } from '@/services/excursion-booking.service';

type RouteContext = { params: Promise<{ id: string }> };

export const PATCH = withRoute<RouteContext>(async (request, context) => {
  await requireAdmin(request);
  const { id } = objectIdParamSchema.parse(await context.params);
  return ok(await confirmExcursionBooking(id));
});
