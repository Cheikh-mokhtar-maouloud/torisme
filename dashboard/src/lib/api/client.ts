import 'server-only';

import { ErrorCode } from '@tourism/shared/constants';
import type { ApiError, ApiResponse, Paginated } from '@tourism/shared/types';

import { config } from '../config';
import { getSessionToken } from '../auth/session';

/**
 * Client HTTP du backend, exclusivement côté serveur.
 *
 * Il ajoute automatiquement le jeton de session et normalise les erreurs : les
 * appelants manipulent toujours un `ApiError` typé, jamais une réponse `fetch`
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
    return this.status === 401 || this.status === 403;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Durée de cache en secondes. `0` (défaut) force une lecture fraîche. */
  revalidate?: number;
  /** Étiquettes de cache Next, pour invalidation ciblée après mutation. */
  tags?: string[];
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = await getSessionToken();

  let response: Response;
  try {
    response = await fetch(`${config.apiUrl}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      next: {
        revalidate: options.revalidate ?? 0,
        ...(options.tags ? { tags: options.tags } : {}),
      },
    });
  } catch (cause) {
    // Backend injoignable : distinguer ce cas d'une erreur applicative évite un
    // message « erreur interne » trompeur alors que le serveur n'est pas démarré.
    throw new ApiRequestError(503, {
      code: ErrorCode.INTERNAL_ERROR,
      message: `Le backend est injoignable (${config.apiUrl}). Est-il démarré ?`,
      ...(cause instanceof Error ? {} : {}),
    });
  }

  const text = await response.text();
  let payload: ApiResponse<T> | undefined;

  try {
    payload = text ? (JSON.parse(text) as ApiResponse<T>) : undefined;
  } catch {
    // Réponse non-JSON : typiquement une page d'erreur HTML servie par Next
    // parce que la route n'existe pas côté backend. Le statut est bien plus
    // parlant que « réponse illisible » seul.
    throw new ApiRequestError(response.status, {
      code: ErrorCode.INTERNAL_ERROR,
      message: `Réponse inattendue du backend (HTTP ${response.status}) sur ${path}`,
    });
  }

  if (!payload) {
    throw new ApiRequestError(response.status, {
      code: ErrorCode.INTERNAL_ERROR,
      message: 'Réponse vide du backend',
    });
  }

  if (!payload.success) {
    throw new ApiRequestError(response.status, payload.error);
  }

  return payload.data;
}

export const api = {
  get: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'GET' }),

  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),

  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),

  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),

  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),

  /** Raccourci typé pour les listes paginées. */
  list: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<Paginated<T>>(path, { ...options, method: 'GET' }),
};

/** Construit une query string en ignorant les valeurs vides. */
export function toSearchParams(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}
