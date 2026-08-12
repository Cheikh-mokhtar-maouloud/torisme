import { config } from './config.js';

/**
 * Appels vers les routes internes du backend.
 *
 * Deux distinctions comptent pour la file, et elles se lisent dans le code de
 * statut :
 *
 * - **5xx et erreurs réseau** : défaillance passagère, la tâche doit être
 *   réessayée. On lève.
 * - **4xx** : la requête est refusée sur le fond — charge utile invalide,
 *   secret erroné. Réessayer cinq fois donnera cinq fois le même refus. On lève
 *   tout de même, parce qu'un 4xx trahit un défaut de configuration ou de code
 *   qu'il faut voir dans les tâches en échec, pas effacer en silence.
 */
export class BackendError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'BackendError';
  }
}

export async function callInternal<T>(path: string, body: unknown): Promise<T> {
  const controller = new AbortController();
  /*
   * Délai généreux, à l'inverse de celui de la publication temps réel : ici on
   * n'est pas dans une requête utilisateur. Personne n'attend, et abandonner
   * trop tôt un envoi d'email en cours transformerait une lenteur en réessai,
   * donc en risque de doublon.
   */
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch(`${config.BACKEND_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Secret': config.INTERNAL_API_SECRET,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new BackendError(
        `${path} a répondu ${response.status}${detail ? ` : ${detail.slice(0, 200)}` : ''}`,
        response.status,
      );
    }

    const payload = (await response.json()) as { success: boolean; data: T };
    return payload.data;
  } finally {
    clearTimeout(timeout);
  }
}
