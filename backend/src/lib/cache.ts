import { env } from '@/config/env';

import { getRedis, safeRedis } from './redis';
import { logger } from './logger';

/**
 * Cache applicatif.
 *
 * Deux règles gouvernent ce qui a le droit d'entrer ici.
 *
 * 1. **Rien qui soit propre à un utilisateur** ne doit être mis en cache sous
 *    une clé partagée. Une clé mal découpée sert le profil d'un compte à un
 *    autre — c'est la fuite de données classique des couches de cache.
 * 2. **Rien dont l'obsolescence soit dangereuse.** Le nombre de places
 *    restantes sur une excursion n'est pas mis en cache : afficher une place
 *    libre qui ne l'est plus provoque une réservation refusée.
 *
 * Le cache est donc réservé au contenu public et aux compteurs indicatifs.
 */

/** Espaces de noms. Regroupés ici pour que l'invalidation reste vérifiable. */
export const CacheNamespace = {
  /** Compteurs de l'écran d'accueil du dashboard. */
  STATS: 'stats',
  /** Catégories : quasi statiques, très lues. */
  CATEGORY: 'category',
} as const;

/*
 * Les listes de contenu (hôtels, restaurants, sites) ne sont **pas** mises en
 * cache. Elles se déclinent en un grand nombre de combinaisons de filtres, de
 * tris et de pages : le taux de succès serait faible, tandis que le risque
 * d'afficher une fiche dépubliée resterait entier. Un cache qui manque souvent
 * et se trompe parfois coûte plus qu'il ne rapporte.
 */

export type CacheNamespace = (typeof CacheNamespace)[keyof typeof CacheNamespace];

function buildKey(namespace: CacheNamespace, key: string): string {
  return `cache:${namespace}:${key}`;
}

/**
 * Lecture avec repli sur la source.
 *
 * En cas de défaut de cache **comme** en cas de panne Redis, `loader` est
 * appelé et son résultat renvoyé. Du point de vue de l'appelant, activer ou
 * couper Redis ne change que la latence, jamais le résultat.
 */
export async function cached<T>(
  namespace: CacheNamespace,
  key: string,
  loader: () => Promise<T>,
  ttlSeconds?: number,
): Promise<T> {
  const fullKey = buildKey(namespace, key);

  const hit = await safeRedis(async (client) => client.get(fullKey), null);

  if (hit !== null) {
    try {
      return JSON.parse(hit) as T;
    } catch {
      // Entrée corrompue ou écrite par une version antérieure du code : on
      // l'ignore et on recharge. Propager l'erreur ferait échouer une requête
      // à cause d'une donnée que l'on peut simplement recalculer.
      logger.warn('entrée de cache illisible', { key: fullKey });
    }
  }

  const value = await loader();

  // L'écriture ne bloque pas la réponse : la valeur est déjà disponible, et
  // attendre Redis pour la renvoyer ajouterait une latence sans contrepartie.
  void safeRedis(
    async (client) =>
      client.set(fullKey, JSON.stringify(value), 'EX', ttlSeconds ?? env().CACHE_TTL_SECONDS),
    null,
  );

  return value;
}

/**
 * Invalide un espace de noms entier.
 *
 * Le parcours utilise `SCAN` et non `KEYS` : `KEYS` bloque le serveur Redis le
 * temps de parcourir l'espace de clés complet, ce qui fige toutes les autres
 * connexions. `UNLINK` libère la mémoire en tâche de fond, contrairement à
 * `DEL` qui la libère de façon synchrone.
 */
export async function invalidate(namespace: CacheNamespace): Promise<void> {
  const client = getRedis();
  if (!client) return;

  const prefix = client.options.keyPrefix ?? '';
  const pattern = `${prefix}${buildKey(namespace, '')}*`;

  try {
    let cursor = '0';

    do {
      const [next, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
      cursor = next;

      if (keys.length > 0) {
        /*
         * `SCAN` renvoie les clés **complètes**, préfixe compris, alors que les
         * commandes du client réappliquent `keyPrefix`. Passer ces clés telles
         * quelles à `unlink` viserait « tourism:tourism:cache:… » et
         * n'effacerait rien — un cache qui ne s'invalide jamais, sans la
         * moindre erreur pour le signaler.
         */
        const stripped = keys.map((key) => (prefix ? key.slice(prefix.length) : key));
        await client.unlink(...stripped);
      }
    } while (cursor !== '0');
  } catch (error) {
    logger.warn('invalidation de cache échouée', {
      namespace,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

/*
 * Les statistiques ne sont pas invalidées explicitement à chaque écriture de
 * contenu. Ce sont des compteurs indicatifs dont la durée de vie est d'une
 * minute : ajouter une invalidation dans les quinze fonctions d'écriture des
 * cinq services de contenu ferait gagner, au mieux, cinquante-neuf secondes de
 * fraîcheur sur un chiffre affiché à titre d'information — pour quinze
 * endroits de plus où l'oublier.
 */
