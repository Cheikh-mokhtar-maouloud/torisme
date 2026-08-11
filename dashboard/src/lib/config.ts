/**
 * Configuration du dashboard.
 *
 * `API_URL` n'est pas préfixée `NEXT_PUBLIC_` : les appels au backend partent
 * exclusivement du serveur Next (server components et server actions), jamais
 * du navigateur. L'URL interne de l'API n'a donc pas à être exposée au bundle.
 *
 * La lecture est **paresseuse**. Valider au chargement du module ferait échouer
 * `next build` sur une machine sans `.env.local`, alors que la compilation n'a
 * besoin d'aucun secret. L'erreur survient au premier appel réel, avec un
 * message qui désigne la variable manquante.
 */
interface Config {
  apiUrl: string;
  appEnv: string;
  isProduction: boolean;
}

let cached: Config | undefined;

function load(): Config {
  const apiUrl = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL;

  if (!apiUrl) {
    throw new Error(
      'API_URL est requis mais absent de l’environnement.\n' +
        'En local : copiez dashboard/.env.example vers dashboard/.env.local.\n' +
        'En production : définissez API_URL dans les variables du projet.',
    );
  }

  return {
    // La barre oblique finale est retirée ici pour que la concaténation des
    // chemins ne produise jamais de « //api/... ».
    apiUrl: apiUrl.replace(/\/$/, ''),
    appEnv: process.env.APP_ENV ?? 'development',
    isProduction: process.env.NODE_ENV === 'production',
  };
}

export const config = {
  get apiUrl(): string {
    cached ??= load();
    return cached.apiUrl;
  },
  get appEnv(): string {
    cached ??= load();
    return cached.appEnv;
  },
  get isProduction(): boolean {
    cached ??= load();
    return cached.isProduction;
  },
};
