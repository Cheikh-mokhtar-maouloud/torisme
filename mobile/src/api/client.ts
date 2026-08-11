import type { ApiError, ApiResponse, Paginated } from '@tourism/shared/types';
import { ErrorCode } from '@tourism/shared/constants';

import { appConfig } from '../config/env';
import { getStoredToken } from '../auth/token-storage';
import { refreshAccessToken } from './refresh';

/**
 * Client HTTP de l'application mobile.
 *
 * Il joint le jeton, normalise les erreurs et impose un délai maximal. Les
 * appelants manipulent toujours un `ApiRequestError` typé, jamais une réponse
 * brute ni une exception réseau nue.
 */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: ApiError['code'];
  readonly fields: Record<string, string[]> | undefined;

  constructor(status: number, error: ApiError) {
    super(error.message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = error.code;
    this.fields = error.fields;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  /** Erreur réseau ou serveur injoignable, par opposition à un refus applicatif. */
  get isNetworkError(): boolean {
    return this.status === 0;
  }
}

/**
 * Un réseau mobile lent ne doit pas laisser un écran en chargement indéfini.
 * Quinze secondes séparent « c'est lent » de « ça ne répondra pas ».
 */
const TIMEOUT_MS = 15_000;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

async function request<T>(path: string, options: RequestOptions = {}, isRetry = false): Promise<T> {
  const token = await getStoredToken();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  // Le signal fourni par React Query (annulation d'écran) doit rester actif en
  // plus du délai maximal : le premier des deux qui se déclenche gagne.
  options.signal?.addEventListener('abort', () => controller.abort());

  let response: Response;

  try {
    response = await fetch(`${appConfig.apiUrl}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      signal: controller.signal,
    });
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    throw new ApiRequestError(0, {
      code: ErrorCode.INTERNAL_ERROR,
      message: aborted
        ? 'La demande a pris trop de temps. Vérifiez votre connexion.'
        : 'Impossible de joindre le serveur. Vérifiez votre connexion.',
    });
  } finally {
    clearTimeout(timeout);
  }

  const text = await response.text();
  let payload: ApiResponse<T> | undefined;

  try {
    payload = text ? (JSON.parse(text) as ApiResponse<T>) : undefined;
  } catch {
    throw new ApiRequestError(response.status, {
      code: ErrorCode.INTERNAL_ERROR,
      message: `Réponse inattendue du serveur (HTTP ${response.status})`,
    });
  }

  if (!payload) {
    throw new ApiRequestError(response.status, {
      code: ErrorCode.INTERNAL_ERROR,
      message: 'Réponse vide du serveur',
    });
  }

  if (!payload.success) {
    /*
     * 401 sur une requête authentifiée : le jeton d'accès a probablement
     * expiré. On tente un renouvellement puis on rejoue **une seule fois** —
     * sans ce garde-fou, un jeton définitivement invalide provoquerait une
     * boucle infinie de renouvellements.
     */
    if (response.status === 401 && token && !isRetry) {
      const renewed = await refreshAccessToken();
      if (renewed) return request<T>(path, options, true);
    }

    throw new ApiRequestError(response.status, payload.error);
  }

  return payload.data;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, signal ? { signal } : {}),
  list: <T>(path: string, signal?: AbortSignal) =>
    request<Paginated<T>>(path, signal ? { signal } : {}),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

/** Construit une query string en ignorant les valeurs vides. */
export function toQuery(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}
