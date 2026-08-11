import { categoryListQuerySchema, createCategorySchema } from '@tourism/shared/validation';

import { created, paginated } from '@/lib/api-response';
import { requireAdmin } from '@/lib/auth/guard';
import { isAdminViewer } from '@/lib/auth/viewer';
import { parseBody, parseQuery, withRoute } from '@/lib/handler';
import { createCategory, listCategories } from '@/services/category.service';

export const GET = withRoute(async (request) => {
  const query = parseQuery(request, categoryListQuerySchema);
  const result = await listCategories(query, await isAdminViewer(request));
  return paginated(result.items, result.meta);
});

export const POST = withRoute(async (request) => {
  await requireAdmin(request);
  const input = await parseBody(request, createCategorySchema);
  return created(await createCategory(input));
});
