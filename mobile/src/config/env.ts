import Constants from 'expo-constants';
import { z } from 'zod';

/**
 * Configuration runtime de l'application mobile.
 *
 * Les valeurs proviennent de `app.config.ts` via `expo-constants`. On les valide
 * au démarrage : une URL d'API absente doit être une erreur explicite au lancement,
 * pas un `fetch undefined/hotels` difficile à diagnostiquer.
 */
const extraSchema = z.object({
  apiUrl: z.url('EXPO_PUBLIC_API_URL doit être une URL valide'),
  appEnv: z.enum(['development', 'staging', 'production']),
  /**
   * Service temps réel. Vide, l'application fonctionne normalement, simplement
   * sans mise à jour instantanée — le temps réel est un confort, pas un socle.
   */
  realtimeUrl: z.union([z.url(), z.literal('')]).default(''),
});

const parsed = extraSchema.safeParse(Constants.expoConfig?.extra ?? {});

if (!parsed.success) {
  throw new Error(
    `Configuration mobile invalide : ${parsed.error.issues
      .map((issue) => `${issue.path.join('.')} — ${issue.message}`)
      .join(', ')}`,
  );
}

export const appConfig = {
  apiUrl: parsed.data.apiUrl.replace(/\/$/, ''),
  realtimeUrl: parsed.data.realtimeUrl.replace(/\/$/, ''),
  appEnv: parsed.data.appEnv,
  isProduction: parsed.data.appEnv === 'production',
} as const;
