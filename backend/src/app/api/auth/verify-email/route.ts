import { verifyEmailSchema } from '@tourism/shared/validation';

import { ok } from '@/lib/api-response';
import { parseBody, withRoute } from '@/lib/handler';
import { verifyEmail } from '@/services/auth.service';

/**
 * POST /api/auth/verify-email
 *
 * Ne renvoie pas de session : l'utilisateur est ensuite dirigé vers la
 * connexion. Ouvrir une session ici ferait de la vérification une seconde porte
 * d'entrée, gardée par six chiffres au lieu d'un mot de passe.
 */
export const POST = withRoute(async (request) => {
  const { email, code } = await parseBody(request, verifyEmailSchema);
  await verifyEmail(email, code);
  return ok({ verified: true });
});
