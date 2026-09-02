import { forgotPasswordSchema } from '@tourism/shared/validation';

import { ok } from '@/lib/api-response';
import { parseBody, withRoute } from '@/lib/handler';
import { requestPasswordReset } from '@/services/auth.service';

/**
 * POST /api/auth/forgot-password
 *
 * Répond toujours la même chose, que l'adresse existe ou non. Une réponse
 * différenciée ferait de ce point d'entrée un moyen de tester des adresses en
 * masse.
 *
 * Le code n'est plus journalisé, même en développement : il l'était pour
 * dérouler le parcours avant que l'envoi de courriels existe. Un secret dans
 * les journaux finit toujours par se retrouver là où on ne l'attend pas.
 */
export const POST = withRoute(async (request) => {
  const { email } = await parseBody(request, forgotPasswordSchema);
  await requestPasswordReset(email);

  return ok({
    message: 'Si un compte existe pour cet email, un code vient d’être envoyé.',
  });
});
