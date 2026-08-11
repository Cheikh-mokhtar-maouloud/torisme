import { objectIdParamSchema, updateHotelSchema } from '@tourism/shared/validation';

import { ok } from '@/lib/api-response';
import { requireAdmin } from '@/lib/auth/guard';
import { isAdminViewer } from '@/lib/auth/viewer';
import { parseBody, withRoute } from '@/lib/handler';
import { deleteHotel, getHotelById, updateHotel } from '@/services/hotel.service';

/**
 * Dans Next 15+, les paramètres de route sont asynchrones.
 * Ils sont validés comme n'importe quelle entrée : un identifiant malformé doit
 * produire une 422 explicite, pas une CastError Mongoose en 500.
 */
type RouteContext = { params: Promise<{ id: string }> };

async function readId(context: RouteContext): Promise<string> {
  const { id } = objectIdParamSchema.parse(await context.params);
  return id;
}

export const GET = withRoute<RouteContext>(async (request, context) => {
  const id = await readId(context);
  return ok(await getHotelById(id, await isAdminViewer(request)));
});

export const PUT = withRoute<RouteContext>(async (request, context) => {
  await requireAdmin(request);
  const id = await readId(context);
  const input = await parseBody(request, updateHotelSchema);
  return ok(await updateHotel(id, input));
});

export const DELETE = withRoute<RouteContext>(async (request, context) => {
  await requireAdmin(request);
  const id = await readId(context);
  await deleteHotel(id);
  return ok({ deleted: true });
});
