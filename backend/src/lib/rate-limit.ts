import type { NextRequest } from 'next/server';

import { verifyAccessToken } from './auth/jwt';
import { getRedis } from './redis';
import { logger } from './logger';

/**
 * Limitation de débit.
 *
 * **Fenêtre fixe**, pas fenêtre glissante. Le compromis est assumé : à cheval
 * sur deux fenêtres, un client peut émettre jusqu'à deux fois la limite. Une
 * fenêtre glissante exacte exige de conserver l'horodatage de chaque requête,
 * soit une mémoire proportionnelle au trafic — un coût réel pour empêcher une
 * rafale de courte durée que la limite suivante rattrape de toute façon.
 *
 * L'incrément et l'expiration sont exécutés dans un **script Lua**, donc
 * atomiquement. Enchaîner `INCR` puis `EXPIRE` depuis le client laisse une
 * fenêtre où l'instance meurt entre les deux : la clé reste alors sans
 * expiration et bloque l'identifiant définitivement.
 */

const INCREMENT_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return { current, redis.call('PTTL', KEYS[1]) }
`;

export interface RateLimitRule {
  /** Requêtes autorisées par fenêtre. */
  limit: number;
  /** Durée de la fenêtre, en secondes. */
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Secondes avant la réinitialisation de la fenêtre. */
  resetSeconds: number;
}

/**
 * Barèmes par famille d'usage.
 *
 * Les endpoints d'authentification sont bien plus stricts que la lecture de
 * contenu : ils sont la cible d'attaques par force brute et par énumération de
 * comptes, alors qu'une liste d'hôtels trop consultée ne coûte qu'un peu de
 * charge.
 */
export const RateLimits = {
  /** Connexion, inscription, mot de passe oublié. */
  AUTH: { limit: 20, windowSeconds: 60 } satisfies RateLimitRule,
  /**
   * Écritures authentifiées. Volontairement large : un administrateur qui
   * saisit du contenu et téléverse des photos émet de vraies rafales, et une
   * limite qui gêne le travail normal finit par être désactivée.
   */
  WRITE: { limit: 120, windowSeconds: 60 } satisfies RateLimitRule,
  /** Lecture publique. */
  READ: { limit: 300, windowSeconds: 60 } satisfies RateLimitRule,
} as const;

/*
 * Note sur la force brute : le verrouillage **par compte** n'est pas ici. Il
 * vit dans `auth.service` sur les champs `failedLoginAttempts` / `lockedUntil`
 * du document utilisateur, depuis la Phase 8.
 *
 * C'est le bon endroit et il n'a pas été déplacé : un contrôle de sécurité
 * stocké en base survit à un redémarrage de Redis, alors qu'un compteur en
 * cache s'efface — un attaquant n'aurait qu'à attendre une purge pour repartir
 * de zéro. La limitation ci-dessous protège l'infrastructure contre le volume ;
 * le verrouillage protège un compte précis. Les deux sont complémentaires, et
 * les fusionner affaiblirait le second.
 */

/*
 * Repli mémoire, utilisé quand Redis n'est pas configuré.
 *
 * Il ne compte **que pour l'instance courante**. En serverless, où les
 * instances se multiplient, la limite effective est donc bien plus haute que
 * la limite annoncée. C'est un filet, pas une protection : la production doit
 * fournir REDIS_URL, ce que `verify:deployment` contrôle.
 */
const memoryCounters = new Map<string, { count: number; expiresAt: number }>();

function memoryIncrement(key: string, rule: RateLimitRule): RateLimitResult {
  const now = Date.now();
  const existing = memoryCounters.get(key);

  if (!existing || existing.expiresAt <= now) {
    // Purge opportuniste : sans elle, la table grossit indéfiniment avec les
    // identifiants vus une seule fois, ce qui finit par consommer la mémoire
    // du processus.
    if (memoryCounters.size > 10_000) {
      for (const [existingKey, entry] of memoryCounters) {
        if (entry.expiresAt <= now) memoryCounters.delete(existingKey);
      }
    }

    const expiresAt = now + rule.windowSeconds * 1_000;
    memoryCounters.set(key, { count: 1, expiresAt });
    return {
      allowed: true,
      limit: rule.limit,
      remaining: rule.limit - 1,
      resetSeconds: rule.windowSeconds,
    };
  }

  existing.count += 1;

  return {
    allowed: existing.count <= rule.limit,
    limit: rule.limit,
    remaining: Math.max(0, rule.limit - existing.count),
    resetSeconds: Math.ceil((existing.expiresAt - now) / 1_000),
  };
}

/**
 * Consomme une unité de quota pour `identifier`.
 *
 * En cas de panne Redis, la requête est **autorisée**. C'est un choix
 * délibéré : la limitation protège contre l'abus, elle n'est pas un contrôle
 * d'accès. Refuser tout le trafic parce que le compteur est injoignable
 * transformerait une panne de cache en interruption de service — exactement ce
 * qu'un attaquant chercherait à provoquer.
 */
export async function rateLimit(
  identifier: string,
  rule: RateLimitRule,
  scope: string,
): Promise<RateLimitResult> {
  const key = `ratelimit:${scope}:${identifier}`;
  const client = getRedis();

  if (!client) return memoryIncrement(key, rule);

  try {
    const [count, ttlMs] = (await client.eval(
      INCREMENT_SCRIPT,
      1,
      key,
      String(rule.windowSeconds * 1_000),
    )) as [number, number];

    return {
      allowed: count <= rule.limit,
      limit: rule.limit,
      remaining: Math.max(0, rule.limit - count),
      resetSeconds: Math.max(1, Math.ceil(ttlMs / 1_000)),
    };
  } catch (error) {
    logger.warn('limitation de débit indisponible, requête autorisée', {
      scope,
      message: error instanceof Error ? error.message : String(error),
    });
    return {
      allowed: true,
      limit: rule.limit,
      remaining: rule.limit,
      resetSeconds: rule.windowSeconds,
    };
  }
}

/**
 * Identifie l'auteur d'une requête.
 *
 * **Le compte prime sur l'adresse IP.** Compter par IP uniquement pénalise le
 * partage d'adresse, qui est la norme et non l'exception : le NAT d'un
 * opérateur mobile mauritanien, le Wi-Fi d'un hôtel, le réseau d'une agence de
 * voyage. Tous ces utilisateurs se partageraient un seul quota, et le plus
 * actif couperait l'accès aux autres — une panne provoquée par des clients
 * légitimes.
 *
 * Le jeton est vérifié cryptographiquement, sans accès à la base. Se contenter
 * de lire son contenu sans contrôler la signature laisserait n'importe qui
 * forger un identifiant différent à chaque requête, et donc obtenir un quota
 * neuf à volonté.
 *
 * Sans jeton valide, on retombe sur l'adresse. Seul le **premier** élément de
 * `x-forwarded-for` est retenu, parce que la plateforme d'hébergement le
 * réécrit ; faire confiance à l'en-tête entier permettrait à un client de le
 * forger et de changer d'identité à chaque requête.
 */
export async function clientIdentifier(request: NextRequest): Promise<string> {
  const authorization = request.headers.get('authorization');

  if (authorization?.toLowerCase().startsWith('bearer ')) {
    const payload = await verifyAccessToken(authorization.slice(7).trim());
    if (payload) return `user:${payload.sub}`;
  }

  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return `ip:${first}`;
  }

  return `ip:${request.headers.get('x-real-ip') ?? 'inconnu'}`;
}
