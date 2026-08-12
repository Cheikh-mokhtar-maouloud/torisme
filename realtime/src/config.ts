import { z } from 'zod';

/**
 * Configuration du service temps réel.
 *
 * Validée au démarrage : un secret manquant doit faire échouer le boot, jamais
 * produire un service qui accepte tout le monde en silence.
 */
const schema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(4100),
  APP_ENV: z.enum(['development', 'staging', 'production']).default('development'),

  /**
   * **Le même secret que le backend.** Le service ne fait que vérifier les
   * jetons d'accès déjà émis ; il n'en produit aucun et n'a pas d'accès à la
   * base. Un secret divergent rendrait toutes les connexions impossibles.
   */
  JWT_SECRET: z.string().min(32, 'JWT_SECRET doit faire au moins 32 caractères'),

  /**
   * Secret partagé avec le backend pour publier des événements.
   *
   * Distinct de `JWT_SECRET` : ce sont deux relations de confiance différentes,
   * et les confondre ferait qu'un jeton client volé permettrait de publier.
   */
  REALTIME_PUBLISH_SECRET: z
    .string()
    .min(32, 'REALTIME_PUBLISH_SECRET doit faire au moins 32 caractères'),

  /** Origines autorisées pour la poignée de main Socket.IO, séparées par des virgules. */
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

export type Config = z.infer<typeof schema>;

export function loadConfig(): Config {
  const parsed = schema.safeParse(process.env);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(
      `Configuration du service temps réel invalide :\n${details}\n\n` +
        'Copiez realtime/.env.example vers realtime/.env et renseignez les valeurs.',
    );
  }

  return parsed.data;
}
