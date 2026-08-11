import { objectIdParamSchema, updateCategorySchema } from '@tourism/shared/validation';

import { ok } from '@/lib/api-response';
import { requireAdmin } from '@/lib/auth/guard';
import { parseBody, withRoute } from '@/lib/handler';
import { deleteCategory, updateCategory } from '@/services/category.service';

type RouteContext = { params: Promise<{ id: string }> };

async function readId(context: RouteContext): Promise<string> {
  const { id } = objectIdParamSchema.parse(await context.params);
  return id;
}

export const PUT = withRoute<RouteContext>(async (request, context) => {
  await requireAdmin(request);
  const id = await readId(context);
  const input = await parseBody(request, updateCategorySchema);
  return ok(await updateCategory(id, input));
});

export const DELETE = withRoute<RouteContext>(async (request, context) => {
  await requireAdmin(request);
  const id = await readId(context);
  await deleteCategory(id);
  return ok({ deleted: true });
});
