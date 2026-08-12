import { ok } from '@/lib/api-response';
import { withRoute } from '@/lib/handler';
import { requireInternalCaller } from '@/lib/internal-auth';
import { RateLimits } from '@/lib/rate-limit';
import { completePastStays } from '@/services/maintenance.service';

/**
 * Entretien périodique. Appelée par le worker à intervalle régulier.
 *
 * Idempotente par construction : les mises à jour sont conditionnées au statut
 * de départ, donc une seconde exécution ne modifie plus rien. C'est ce qui rend
 * sans conséquence un déclenchement en double — deux workers, un réessai — sans
 * qu'aucun verrou soit nécessaire.
 */
export const POST = withRoute(
  async (request) => {
    requireInternalCaller(request);

    const report = await completePastStays();

    return ok(report);
  },
  { rateLimit: RateLimits.READ },
);
