import { resendVerificationSchema } from '@tourism/shared/validation';

import { ok } from '@/lib/api-response';
import { parseBody, withRoute } from '@/lib/handler';
import { resendEmailVerification } from '@/services/auth.service';

/**
 * POST /api/auth/resend-verification
 *
 * Répond toujours la même chose, que l'adresse existe ou non, qu'elle soit
 * déjà vérifiée ou non. Une réponse différenciée ferait de ce point d'entrée un
 * moyen de tester des adresses en masse.
 */
export const POST = withRoute(async (request) => {
  const { email } = await parseBody(request, resendVerificationSchema);
  await resendEmailVerification(email);
  return ok({ sent: true });
});
