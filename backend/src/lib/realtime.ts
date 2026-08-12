import type { SocketEvent } from '@tourism/shared/constants';

import { realtimeChannel } from '@tourism/shared/constants';

import { env } from '@/config/env';

import { logger } from './logger';
import { safeRedis } from './redis';

/**
 * Publication d'événements vers le service temps réel.
 *
 * Le backend tourne en serverless et ne peut donc pas maintenir de connexion
 * permanente vers Socket.IO : il pousse chaque événement par un appel HTTP
 * signé d'un secret partagé.
 *
 * Depuis la Phase 13, **Redis pub/sub est le transport préféré**. L'appel HTTP
 * reste en second recours.
 *
 * Ce que le pub/sub apporte, et que HTTP ne pouvait pas donner : un message
 * publié sur un canal atteint *toutes* les instances abonnées. Avec HTTP, le
 * backend ne pouvait joindre qu'une seule adresse — donc une seule instance
 * temps réel — et les clients connectés aux autres n'auraient jamais rien reçu.
 * C'est la condition de la mise à l'échelle horizontale prévue en Phase 16.
 */

type Target = { kind: 'user'; userId: string } | { kind: 'admins' };

/**
 * Publie un événement. **Ne lève jamais.**
 *
 * Le temps réel est un confort : il accélère l'affichage d'une information que
 * le client obtiendrait de toute façon en rechargeant. Faire échouer une
 * confirmation de réservation parce que le service de diffusion est arrêté
 * inverserait complètement le rapport d'importance.
 */
export async function publish(
  event: SocketEvent,
  target: Target,
  payload: Record<string, unknown> = {},
): Promise<void> {
  const config = env();

  /*
   * Voie préférée : Redis. `publish` renvoie le nombre d'abonnés joints ; zéro
   * signifie qu'aucun service temps réel n'écoute, et il est alors inutile de
   * tenter le repli HTTP — il viserait le même service absent.
   */
  if (config.REDIS_URL) {
    const delivered = await safeRedis(
      async (client) =>
        client.publish(
          realtimeChannel(config.REDIS_KEY_PREFIX),
          JSON.stringify({ event, target, payload }),
        ),
      -1,
    );

    // -1 : Redis lui-même est indisponible. On retombe alors sur HTTP, qui a
    // ses propres défaillances mais pas les mêmes.
    if (delivered >= 0) return;
  }

  // Service non configuré : l'application fonctionne sans, simplement sans
  // mise à jour instantanée. C'est le cas en développement par défaut.
  if (!config.REALTIME_URL || !config.REALTIME_PUBLISH_SECRET) return;

  try {
    const controller = new AbortController();
    // Délai court : la publication est en chemin critique d'une requête API.
    // Mieux vaut renoncer au temps réel que ralentir une confirmation.
    const timeout = setTimeout(() => controller.abort(), 2_000);

    const response = await fetch(`${config.REALTIME_URL}/emit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Publish-Secret': config.REALTIME_PUBLISH_SECRET,
      },
      body: JSON.stringify({ event, target, payload }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      logger.warn('publication temps réel refusée', { event, status: response.status });
    }
  } catch (error) {
    logger.warn('service temps réel injoignable', {
      event,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }
}
