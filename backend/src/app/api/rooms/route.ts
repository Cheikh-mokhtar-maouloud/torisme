import { createRoomSchema, roomListQuerySchema } from '@tourism/shared/validation';

import { created, paginated } from '@/lib/api-response';
import { requireAdmin } from '@/lib/auth/guard';
import { isAdminViewer } from '@/lib/auth/viewer';
import { parseBody, parseQuery, withRoute } from '@/lib/handler';
import { createRoom, listRooms } from '@/services/room.service';

export const GET = withRoute(async (request) => {
  const query = parseQuery(request, roomListQuerySchema);
  const result = await listRooms(query, await isAdminViewer(request));
  return paginated(result.items, result.meta);
});

export const POST = withRoute(async (request) => {
  await requireAdmin(request);
  const input = await parseBody(request, createRoomSchema);
  return created(await createRoom(input));
});
