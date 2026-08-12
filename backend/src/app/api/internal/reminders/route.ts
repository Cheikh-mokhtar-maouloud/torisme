import { excursionReminderJobSchema } from '@tourism/shared/validation';

import { ok } from '@/lib/api-response';
import { parseBody, withRoute } from '@/lib/handler';
import { requireInternalCaller } from '@/lib/internal-auth';
import { RateLimits } from '@/lib/rate-limit';
import { sendExcursionReminder } from '@/services/excursion-booking.service';

/**
 * Déclenche le rappel d'une excursion. Appelée par le worker.
 *
 * Répond 200 même lorsque rien n'est envoyé — réservation annulée, rappel déjà
 * parti. Ce n'est pas un échec : c'est le résultat attendu du garde-fou
 * d'idempotence, et renvoyer une erreur ferait réessayer le worker sur une
 * condition qui ne changera jamais, jusqu'à épuisement des tentatives.
 */
export const POST = withRoute(
  async (request) => {
    requireInternalCaller(request);

    const { excursionBookingId } = await parseBody(request, excursionReminderJobSchema);
    const result = await sendExcursionReminder(excursionBookingId);

    return ok(result);
  },
  { rateLimit: RateLimits.READ },
);
