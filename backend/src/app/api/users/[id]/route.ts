import { adminUpdateUserSchema, objectIdParamSchema } from '@tourism/shared/validation';

import { ok } from '@/lib/api-response';
import { requireAdmin } from '@/lib/auth/guard';
import { parseBody, withRoute } from '@/lib/handler';
import { adminUpdateUser, getUserById } from '@/services/user.service';

type RouteContext = { params: Promise<{ id: string }> };

async function readId(context: RouteContext): Promise<string> {
  const { id } = objectIdParamSchema.parse(await context.params);
  return id;
}

export const GET = withRoute<RouteContext>(async (request, context) => {
  await requireAdmin(request);
  return ok(await getUserById(await readId(context)));
});

/**
 * PATCH plutôt que PUT : l'administration ne modifie que quelques champs
 * (rôle, activation, identité), jamais la ressource entière.
 */
export const PATCH = withRoute<RouteContext>(async (request, context) => {
  const actor = await requireAdmin(request);
  const id = await readId(context);
  const input = await parseBody(request, adminUpdateUserSchema);
  return ok(await adminUpdateUser(id, input, actor.userId));
});
