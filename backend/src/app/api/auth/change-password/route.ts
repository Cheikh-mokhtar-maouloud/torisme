import { changePasswordSchema } from '@tourism/shared/validation';

import { ok } from '@/lib/api-response';
import { requireAuth } from '@/lib/auth/guard';
import { clearRefreshCookie } from '@/lib/auth/refresh-cookie';
import { parseBody, withRoute } from '@/lib/handler';
import { changePassword } from '@/services/auth.service';

/**
 * POST /api/auth/change-password
 *
 * Toutes les sessions sont révoquées, y compris celle en cours : l'utilisateur
 * se reconnecte avec son nouveau mot de passe. C'est le comportement attendu —
 * changer son mot de passe doit fermer les sessions ouvertes ailleurs.
 */
export const POST = withRoute(async (request) => {
  const auth = await requireAuth(request);
  const input = await parseBody(request, changePasswordSchema);
  await changePassword(auth.userId, input);

  const response = ok({ message: 'Mot de passe modifié. Reconnectez-vous.' });
  clearRefreshCookie(response);
  return response;
});
