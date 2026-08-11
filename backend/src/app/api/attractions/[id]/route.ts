import { objectIdParamSchema, updateAttractionSchema } from '@tourism/shared/validation';

import { ok } from '@/lib/api-response';
import { requireAdmin } from '@/lib/auth/guard';
import { isAdminViewer } from '@/lib/auth/viewer';
import { parseBody, withRoute } from '@/lib/handler';
import {
  deleteAttraction,
  getAttractionById,
  updateAttraction,
} from '@/services/attraction.service';

type RouteContext = { params: Promise<{ id: string }> };

async function readId(context: RouteContext): Promise<string> {
  const { id } = objectIdParamSchema.parse(await context.params);
  return id;
}

export const GET = withRoute<RouteContext>(async (request, context) => {
  const id = await readId(context);
  return ok(await getAttractionById(id, await isAdminViewer(request)));
});

export const PUT = withRoute<RouteContext>(async (request, context) => {
  await requireAdmin(request);
  const id = await readId(context);
  const input = await parseBody(request, updateAttractionSchema);
  return ok(await updateAttraction(id, input));
});

export const DELETE = withRoute<RouteContext>(async (request, context) => {
  await requireAdmin(request);
  const id = await readId(context);
  await deleteAttraction(id);
  return ok({ deleted: true });
});
