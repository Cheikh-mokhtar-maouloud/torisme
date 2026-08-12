import { NextResponse } from 'next/server';
import type { ZodError } from 'zod';

import { ErrorCode } from '@tourism/shared/constants';
import type { ApiError, ApiResponse, Paginated, PaginationMeta } from '@tourism/shared/types';

/**
 * Constructeurs de réponses HTTP.
 *
 * Toutes les routes passent par ici : le format `{ success, data | error }` doit
 * rester identique partout, sinon les clients doivent gérer plusieurs formes.
 */

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json<ApiResponse<T>>({ success: true, data }, { status: 200, ...init });
}

export function created<T>(data: T) {
  return NextResponse.json<ApiResponse<T>>({ success: true, data }, { status: 201 });
}

export function paginated<T>(items: T[], meta: PaginationMeta) {
  return ok<Paginated<T>>({ items, meta });
}

export function fail(
  code: ApiError['code'],
  message: string,
  status: number,
  fields?: ApiError['fields'],
  headers?: Record<string, string>,
) {
  return NextResponse.json<ApiResponse<never>>(
    { success: false, error: { code, message, ...(fields ? { fields } : {}) } },
    { status, ...(headers ? { headers } : {}) },
  );
}

export const unauthorized = (message = 'Authentification requise') =>
  fail(ErrorCode.UNAUTHORIZED, message, 401);

export const forbidden = (message = 'Accès refusé') => fail(ErrorCode.FORBIDDEN, message, 403);

export const notFound = (message = 'Ressource introuvable') =>
  fail(ErrorCode.NOT_FOUND, message, 404);

export const conflict = (message: string) => fail(ErrorCode.CONFLICT, message, 409);

export const internalError = (message = 'Erreur interne du serveur') =>
  fail(ErrorCode.INTERNAL_ERROR, message, 500);

/** Convertit une erreur Zod en réponse 422 avec le détail par champ. */
export function validationError(error: ZodError) {
  const fields: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    (fields[key] ??= []).push(issue.message);
  }
  return fail(ErrorCode.VALIDATION_ERROR, 'Données invalides', 422, fields);
}

/** Calcule les métadonnées de pagination à partir du total renvoyé par MongoDB. */
export function buildPaginationMeta(page: number, limit: number, total: number): PaginationMeta {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return { page, limit, total, totalPages, hasNextPage: page < totalPages };
}
