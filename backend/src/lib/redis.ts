import Redis, { type RedisOptions } from 'ioredis';

import { env } from '@/config/env';

import { logger } from './logger';

/**
 * Connexion Redis partagée.
 *
 * Redis est **facultatif**. Sans `REDIS_URL`, `getRedis()` renvoie `null` et
 * chaque appelant applique sa propre dégradation : cache transparent, file
 * exécutée en ligne, limitation de débit en mémoire. Aucun chemin métier ne
 * doit supposer sa présence.
 *
 * Deux réglages sont décisifs en serverless et méritent d'être explicités.
 *
 * `enableOfflineQueue: false` — par défaut, ioredis empile les commandes
 * envoyées pendant une coupure et les rejoue à la reconnexion. Pour un cache,
 * c'est exactement le mauvais comportement : une requête API resterait en
 * attente d'un Redis mort au lieu d'aller lire MongoDB. On préfère une erreur
 * immédiate, que l'appelant traite comme un défaut de cache.
 *
 * `maxRetriesPerRequest: 1` — même raisonnement. Le cache est en chemin
 * critique ; réessayer vingt fois transformerait une panne Redis en panne API.
 */

declare global {
  var __tourismRedis: Redis | null | undefined;
}

/** Options communes. Exportées pour BullMQ, qui exige ses propres réglages. */
export function redisOptions(overrides: RedisOptions = {}): RedisOptions {
  return {
    // Connexion établie au premier usage réel, pas à l'import du module :
    // un build ou un script qui n'utilise pas Redis ne doit pas s'y connecter.
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 3_000,
    // Plafonne le délai entre tentatives. Sans cela, ioredis peut atteindre
    // plusieurs dizaines de secondes et donner l'illusion d'un service figé.
    retryStrategy: (times) => Math.min(times * 200, 3_000),
    ...overrides,
  };
}

/**
 * Client de cache, ou `null` si Redis n'est pas configuré.
 *
 * Le client est mémorisé sur `globalThis` pour la même raison que la connexion
 * MongoDB : le rechargement à chaud du développement réévalue les modules et
 * ouvrirait une connexion de plus à chaque édition de fichier.
 */
export function getRedis(): Redis | null {
  if (globalThis.__tourismRedis !== undefined) return globalThis.__tourismRedis;

  const url = env().REDIS_URL;

  if (!url) {
    globalThis.__tourismRedis = null;
    return null;
  }

  const client = new Redis(url, redisOptions({ keyPrefix: `${env().REDIS_KEY_PREFIX}:` }));

  /*
   * Un client Redis sans gestionnaire « error » fait tomber le processus Node
   * entier sur une simple coupure réseau. On journalise en `warn`, jamais en
   * `error` : une panne de cache est un incident dégradé, pas une panne
   * applicative, et la noyer parmi les vraies erreurs masquerait ces dernières.
   */
  client.on('error', (error: Error) => {
    logger.warn('redis indisponible', { message: error.message });
  });

  globalThis.__tourismRedis = client;
  return client;
}

/**
 * Exécute une opération Redis en absorbant toute défaillance.
 *
 * Tous les usages de Redis dans le backend passent par ici. C'est ce qui rend
 * la dégradation systématique plutôt que dépendante de la vigilance de chaque
 * appelant : oublier un `try/catch` sur une commande de cache suffirait à faire
 * échouer une requête API à cause d'un service facultatif.
 */
export async function safeRedis<T>(
  operation: (client: Redis) => Promise<T>,
  fallback: T,
): Promise<T> {
  const client = getRedis();
  if (!client) return fallback;

  try {
    return await operation(client);
  } catch (error) {
    logger.warn('opération redis échouée', {
      message: error instanceof Error ? error.message : String(error),
    });
    return fallback;
  }
}

/** Ferme la connexion. Utilisé par les scripts, qui doivent rendre la main. */
export async function closeRedis(): Promise<void> {
  const client = globalThis.__tourismRedis;
  globalThis.__tourismRedis = undefined;
  if (client) await client.quit().catch(() => client.disconnect());
}
