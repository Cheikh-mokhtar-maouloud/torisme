import { objectIdParamSchema } from '@tourism/shared/validation';

import { ok } from '@/lib/api-response';
import { requireAuth } from '@/lib/auth/guard';
import { withRoute } from '@/lib/handler';
import { reportReview } from '@/services/review.service';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/reviews/:id/report
 *
 * Le signalement remonte l'avis dans la file de modération. Aucun seuil ne le
 * masque automatiquement : un retrait déclenché par le nombre de signalements
 * deviendrait vite un outil de censure entre concurrents.
 */
export const POST = withRoute<RouteContext>(async (request, context) => {
  await requireAuth(request);
  const { id } = objectIdParamSchema.parse(await context.params);
  await reportReview(id);
  return ok({ reported: true });
});
