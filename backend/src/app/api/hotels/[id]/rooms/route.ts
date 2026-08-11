import { objectIdParamSchema } from '@tourism/shared/validation';

import { paginated } from '@/lib/api-response';
import { isAdminViewer } from '@/lib/auth/viewer';
import { withRoute } from '@/lib/handler';
import { listRoomsByHotel } from '@/services/room.service';

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/hotels/:id/rooms — chambres d'un hôtel, triées par prix croissant. */
export const GET = withRoute<RouteContext>(async (request, context) => {
  const { id } = objectIdParamSchema.parse(await context.params);
  const result = await listRoomsByHotel(id, await isAdminViewer(request));
  return paginated(result.items, result.meta);
});
