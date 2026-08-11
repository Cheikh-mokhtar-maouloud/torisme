import { ok } from '@/lib/api-response';
import { requireAdmin } from '@/lib/auth/guard';
import { HttpError } from '@/lib/errors';
import { withRoute } from '@/lib/handler';
import { logger } from '@/lib/logger';
import { storage } from '@/lib/storage';

/**
 * DELETE /api/uploads/<providerId>
 *
 * Le `providerId` contient des barres obliques (`hotels/1699-ab12.jpg` en
 * local, `tourism/hotels/xyz` chez Cloudinary) : la route est donc attrape-tout
 * et le reconstruit à partir des segments.
 */
type RouteContext = { params: Promise<{ providerId: string[] }> };

export const DELETE = withRoute<RouteContext>(async (request, context) => {
  await requireAdmin(request);

  const { providerId } = await context.params;
  const identifier = providerId.join('/');

  if (!identifier) throw HttpError.validation('Identifiant de fichier manquant');

  await storage().remove(identifier);
  logger.info('image supprimée du stockage', { providerId: identifier });

  return ok({ deleted: true });
});
