import { forgotPasswordSchema } from '@tourism/shared/validation';

import { ok } from '@/lib/api-response';
import { env } from '@/config/env';
import { parseBody, withRoute } from '@/lib/handler';
import { logger } from '@/lib/logger';
import { requestPasswordReset } from '@/services/auth.service';

/**
 * POST /api/auth/forgot-password
 *
 * Répond **toujours** la même chose, que l'email existe ou non : une réponse
 * différenciée permettrait d'énumérer les comptes enregistrés.
 */
export const POST = withRoute(async (request) => {
  const { email } = await parseBody(request, forgotPasswordSchema);
  const token = await requestPasswordReset(email);

  /*
   * L'envoi d'emails arrive en Phase 11. En attendant, le jeton est journalisé
   * en développement pour permettre de dérouler le parcours.
   *
   * Il n'est jamais renvoyé dans la réponse ni journalisé en production : ce
   * serait offrir la réinitialisation de n'importe quel compte à qui la demande.
   */
  if (token && env().APP_ENV !== 'production') {
    logger.info('jeton de réinitialisation (développement uniquement)', { email, token });
  }

  return ok({
    message: 'Si un compte existe pour cet email, un lien de réinitialisation vient d’être envoyé.',
  });
});
