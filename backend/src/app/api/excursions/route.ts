import { createExcursionSchema, excursionListQuerySchema } from '@tourism/shared/validation';

import { created, paginated } from '@/lib/api-response';
import { requireAdmin } from '@/lib/auth/guard';
import { isAdminViewer } from '@/lib/auth/viewer';
import { parseBody, parseQuery, withRoute } from '@/lib/handler';
import { createExcursion, listExcursions } from '@/services/excursion.service';

export const GET = withRoute(async (request) => {
  const query = parseQuery(request, excursionListQuerySchema);
  const result = await listExcursions(query, await isAdminViewer(request));
  return paginated(result.items, result.meta);
});

export const POST = withRoute(async (request) => {
  await requireAdmin(request);
  const input = await parseBody(request, createExcursionSchema);
  return created(await createExcursion(input));
});
