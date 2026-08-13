import { z } from 'zod';

/**
 * Validation des variables d'environnement au démarrage.
 *
 * Un secret manquant ou malformé doit faire échouer le boot immédiatement,
 * jamais produire une erreur silencieuse au premier appel API.
 */
/**
 * Traite une chaîne vide comme une variable absente.
 *
 * Docker Compose écrit `${VAR:-}` sous forme de chaîne vide, jamais d'absence :
 * une variable facultative laissée vide dans `.env` arrive donc à Zod comme
 * `''`, qui échoue sur `.min(32)`. Le service refuse alors de démarrer à cause
 * d'un secret qu'on avait justement choisi de ne pas renseigner.
 */
function optionalSecret(min = 32) {
  return z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().min(min).optional(),
  );
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_ENV: z.enum(['development', 'staging', 'production']).default('development'),

  MONGODB_URI: z.string().min(1, 'MONGODB_URI est requis'),
  MONGODB_DB_NAME: z.string().min(1).default('tourism'),
  /**
   * Connexions maximales par instance. La valeur par défaut vise le serverless,
   * où de nombreuses instances coexistent ; un serveur unique (Phase 15) doit
   * la relever nettement.
   */
  MONGODB_MAX_POOL_SIZE: z.coerce.number().int().min(1).max(100).default(5),

  /** Secret de signature des jetons. 32 caractères minimum. */
  JWT_SECRET: z.string().min(32, 'JWT_SECRET doit faire au moins 32 caractères'),
  /**
   * Clé précédente, acceptée en **vérification seulement**, le temps d'une
   * rotation. À retirer une fois la durée de vie des jetons d'accès écoulée :
   * la laisser en place indéfiniment maintiendrait valide un secret que la
   * rotation était censée retirer du service.
   */
  JWT_SECRET_PREVIOUS: optionalSecret(),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),

  /** Origines autorisées par CORS, séparées par des virgules. */
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),

  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  /* --- Stockage des images ------------------------------------------------ */
  STORAGE_PROVIDER: z.enum(['local', 'cloudinary']).default('local'),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  /**
   * Racine publique de l'API, utilisée pour construire les URL du stockage
   * local. Sans elle, les images pointeraient vers un chemin relatif que
   * l'application mobile — sur un autre hôte — ne saurait pas résoudre.
   */
  PUBLIC_BASE_URL: z.string().url().default('http://localhost:4000'),

  /**
   * Répertoire des fichiers téléversés, en stockage local.
   *
   * **Explicite, et non déduit du répertoire de travail.** Next modifie le
   * `cwd` du processus dans sa sortie autonome : un chemin construit sur
   * `process.cwd()` désigne alors `/app/backend/.uploads` là où l'on croyait
   * écrire dans `/app/.uploads`. Le volume se monte au mauvais endroit sans la
   * moindre erreur, et chaque instance écrit sur son disque éphémère — invisible
   * tant qu'une seule instance tourne.
   */
  UPLOAD_DIR: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),

  /* --- Emails -------------------------------------------------------------- */
  MAIL_PROVIDER: z.enum(['console', 'resend']).default('console'),
  MAIL_API_KEY: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
  /** Expéditeur, au format « Nom <adresse@domaine> ». Le domaine doit être vérifié. */
  MAIL_FROM: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
  /**
   * Racine des liens envoyés par email (réinitialisation, confirmation).
   * Pointe vers le dashboard ou le site public, pas vers l'API.
   */
  APP_PUBLIC_URL: z.string().url().default('http://localhost:3000'),

  /* --- Temps réel ---------------------------------------------------------- */
  /**
   * Racine du service Socket.IO. Absente, l'application fonctionne normalement,
   * simplement sans mise à jour instantanée — le temps réel est un confort.
   */
  REALTIME_URL: z.preprocess((v) => (v === '' ? undefined : v), z.string().url().optional()),
  /** Secret partagé avec le service temps réel. Distinct de `JWT_SECRET`. */
  REALTIME_PUBLISH_SECRET: optionalSecret(),

  /* --- Redis : cache, files, limitation de débit --------------------------- */
  /**
   * Connexion Redis. **Absente, tout continue de fonctionner** : le cache
   * devient transparent, les files s'exécutent en ligne, la limitation de débit
   * retombe sur un compteur mémoire. C'est le cas par défaut en développement.
   */
  REDIS_URL: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
  /**
   * Préfixe de toutes les clés. Il permet de partager une instance Redis entre
   * plusieurs environnements sans qu'un `staging` puisse lire ou invalider le
   * cache de `production`.
   */
  REDIS_KEY_PREFIX: z.string().min(1).default('tourism'),
  /** Durée de vie par défaut des entrées de cache, en secondes. */
  CACHE_TTL_SECONDS: z.coerce.number().int().min(1).max(86_400).default(60),

  /* --- Appels internes (worker) -------------------------------------------- */
  /**
   * Secret partagé avec le worker. Distinct de `JWT_SECRET` et de
   * `REALTIME_PUBLISH_SECRET`. Absent, les routes `/api/internal/*` refusent
   * tout appel — le défaut sûr.
   */
  INTERNAL_API_SECRET: optionalSecret(),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(
      `Configuration d'environnement invalide :\n${details}\n\n` +
        'Copiez .env.example vers .env.local et renseignez les valeurs manquantes.',
    );
  }

  return parsed.data;
}

let cached: Env | undefined;

/**
 * Accès paresseux : la validation ne s'exécute qu'au premier usage réel,
 * ce qui évite de casser des commandes de build qui n'ont pas besoin des secrets.
 */
export function env(): Env {
  cached ??= loadEnv();
  return cached;
}

export const isProduction = () => env().NODE_ENV === 'production';
