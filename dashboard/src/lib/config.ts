/**
 * Configuration du dashboard, lue une seule fois et validée.
 *
 * `API_URL` n'est pas préfixée `NEXT_PUBLIC_` : les appels au backend partent
 * exclusivement du serveur Next (server components et server actions), jamais
 * du navigateur. L'URL interne de l'API n'a donc pas à être exposée au client.
 */
const apiUrl = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL;

if (!apiUrl) {
  throw new Error('API_URL est requis. Copiez dashboard/.env.example vers dashboard/.env.local.');
}

export const config = {
  apiUrl: apiUrl.replace(/\/$/, ''),
  appEnv: process.env.APP_ENV ?? 'development',
  isProduction: process.env.NODE_ENV === 'production',
} as const;
