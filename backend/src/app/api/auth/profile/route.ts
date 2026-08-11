import { updateProfileSchema } from '@tourism/shared/validation';

import { ok } from '@/lib/api-response';
import { requireAuth } from '@/lib/auth/guard';
import { parseBody, withRoute } from '@/lib/handler';
import { updateProfile } from '@/services/auth.service';

/**
 * PATCH /api/auth/profile
 *
 * L'email n'y figure pas : le changer suppose de vérifier la nouvelle adresse,
 * sans quoi une faute de frappe rendrait le compte irrécupérable. Ce parcours
 * viendra avec les emails (Phase 11).
 */
export const PATCH = withRoute(async (request) => {
  const auth = await requireAuth(request);
  const input = await parseBody(request, updateProfileSchema);
  return ok(await updateProfile(auth.userId, input));
});
