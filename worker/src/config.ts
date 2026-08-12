import { z } from 'zod';

/**
 * Configuration du worker.
 *
 * Remarquer ce qui **n'y figure pas** : ni `MONGODB_URI`, ni la clé du
 * fournisseur d'emails, ni `JWT_SECRET`. Le worker ne parle jamais directement
 * à la base ni à un service tiers ; il appelle des routes internes du backend.
 *
 * Le bénéfice est concret : compromettre le worker ne donne accès ni aux
 * données ni au compte d'envoi d'emails, seulement au droit de déclencher des
 * traitements que le backend valide de toute façon.
 */
const schema = z.object({
  APP_ENV: z.enum(['development', 'staging', 'production']).default('development'),

  /** Connexion Redis. Obligatoire : sans file, le worker n'a rien à faire. */
  REDIS_URL: z.string().min(1, 'REDIS_URL est requis'),
  /** Doit être identique à `REDIS_KEY_PREFIX` du backend. */
  REDIS_KEY_PREFIX: z.string().min(1).default('tourism'),

  /** Racine de l'API. */
  BACKEND_URL: z.url(),
  /** Doit être identique à `INTERNAL_API_SECRET` du backend. */
  INTERNAL_API_SECRET: z.string().min(32, 'INTERNAL_API_SECRET doit faire au moins 32 caractères'),

  /**
   * Tâches traitées simultanément par file.
   *
   * Volontairement modeste : la limite réelle n'est pas le worker mais le
   * fournisseur d'emails, dont le quota par seconde est vite atteint. Une
   * concurrence élevée ne ferait que transformer des envois en erreurs 429,
   * donc en réessais.
   */
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(50).default(5),

  /** Période de l'entretien, en minutes. */
  MAINTENANCE_INTERVAL_MINUTES: z.coerce.number().int().min(1).max(1_440).default(60),

  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type WorkerConfig = z.infer<typeof schema>;

function load(): WorkerConfig {
  const parsed = schema.safeParse(process.env);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    // Échec bruyant au démarrage. Un worker qui boote avec une configuration
    // incomplète consommerait des tâches et les ferait toutes échouer.
    throw new Error(`Configuration du worker invalide :\n${details}`);
  }

  return parsed.data;
}

export const config = load();

/**
 * BullMQ attend un objet de connexion, pas une URL.
 *
 * `maxRetriesPerRequest: null` est **imposé** par BullMQ : ses connexions
 * exécutent des commandes bloquantes qui attendent volontairement plusieurs
 * secondes, qu'un plafond de réessais interpréterait comme des échecs.
 */
export function redisConnection() {
  const parsed = new URL(config.REDIS_URL);
  const db = parsed.pathname.replace('/', '');

  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    ...(parsed.password ? { password: decodeURIComponent(parsed.password) } : {}),
    ...(parsed.username ? { username: decodeURIComponent(parsed.username) } : {}),
    ...(db ? { db: Number(db) } : {}),
    ...(parsed.protocol === 'rediss:' ? { tls: {} } : {}),
    maxRetriesPerRequest: null,
  };
}
