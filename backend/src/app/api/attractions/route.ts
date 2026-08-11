import { createAttractionSchema, attractionListQuerySchema } from '@tourism/shared/validation';

import { created, paginated } from '@/lib/api-response';
import { requireAdmin } from '@/lib/auth/guard';
import { isAdminViewer } from '@/lib/auth/viewer';
import { parseBody, parseQuery, withRoute } from '@/lib/handler';
import { createAttraction, listAttractions } from '@/services/attraction.service';

export const GET = withRoute(async (request) => {
  const query = parseQuery(request, attractionListQuerySchema);
  const result = await listAttractions(query, await isAdminViewer(request));
  return paginated(result.items, result.meta);
});

export const POST = withRoute(async (request) => {
  await requireAdmin(request);
  const input = await parseBody(request, createAttractionSchema);
  return created(await createAttraction(input));
});
