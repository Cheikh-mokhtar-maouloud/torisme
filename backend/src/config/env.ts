import { z } from 'zod';

/**
 * Validation des variables d'environnement au démarrage.
 *
 * Un secret manquant ou malformé doit faire échouer le boot immédiatement,
 * jamais produire une erreur silencieuse au premier appel API.
 */
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
