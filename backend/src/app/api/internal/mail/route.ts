import { sendMailJobSchema } from '@tourism/shared/validation';

import { ok } from '@/lib/api-response';
import { parseBody, withRoute } from '@/lib/handler';
import { requireInternalCaller } from '@/lib/internal-auth';
import { RateLimits } from '@/lib/rate-limit';
import { deliverEmail } from '@/services/notification.service';

/**
 * Remise d'un email, appelée par le worker.
 *
 * Le worker ne détient donc **ni la clé du fournisseur d'emails ni l'URI
 * MongoDB** : il ne sait que réessayer et ordonnancer. Concentrer les secrets
 * dans un seul service réduit d'autant la surface à protéger, et évite de
 * dupliquer l'abstraction de fournisseur dans un second processus.
 *
 * L'erreur est **volontairement propagée** : c'est le code HTTP qui indique au
 * worker si la tâche doit être réessayée. Répondre 200 sur un échec ferait
 * marquer la tâche comme réussie et perdrait l'email définitivement.
 */
export const POST = withRoute(
  async (request) => {
    requireInternalCaller(request);

    const message = await parseBody(request, sendMailJobSchema);
    await deliverEmail(message);

    return ok({ delivered: true });
  },
  // Barème large : une diffusion administrative génère une rafale légitime,
  // et le worker est un appelant identifié, pas un client anonyme.
  { rateLimit: RateLimits.READ },
);
