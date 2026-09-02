import { registerSchema } from '@tourism/shared/validation';

import { created } from '@/lib/api-response';
import { parseBody, withRoute } from '@/lib/handler';
import { register } from '@/services/auth.service';

/**
 * POST /api/auth/register — création d'un compte utilisateur.
 *
 * Aucune session n'est ouverte et aucun cookie n'est posé : l'adresse doit
 * d'abord être vérifiée par le code envoyé. Poser un jeton ici donnerait un
 * compte utilisable à qui saisit l'adresse d'un autre.
 */
export const POST = withRoute(async (request) => {
  const input = await parseBody(request, registerSchema);
  return created(await register(input));
});
