import type { NextRequest, NextResponse } from 'next/server';
import { MongoServerError } from 'mongodb';
import { Error as MongooseError } from 'mongoose';
import { ZodError, type ZodType } from 'zod';

import { ErrorCode } from '@tourism/shared/constants';

import { connectToDatabase } from './db';
import { HttpError } from './errors';
import { logger, serializeError } from './logger';
import { fail, internalError, validationError } from './api-response';

type RouteHandler<TContext> = (
  request: NextRequest,
  context: TContext,
) => Promise<NextResponse> | NextResponse;

/**
 * Enveloppe commune à tous les route handlers.
 *
 * Elle assure la connexion à la base, journalise l'appel et convertit toute
 * exception en réponse au format standard. Sans ce point unique, chaque route
 * dupliquerait un `try/catch` — et une route qui l'oublierait renverrait une
 * page d'erreur HTML de Next à un client qui attend du JSON.
 */
export function withRoute<TContext = unknown>(handler: RouteHandler<TContext>) {
  return async (request: NextRequest, context: TContext): Promise<NextResponse> => {
    const startedAt = Date.now();

    try {
      await connectToDatabase();
      const response = await handler(request, context);

      logger.info('request', {
        method: request.method,
        path: new URL(request.url).pathname,
        status: response.status,
        durationMs: Date.now() - startedAt,
      });

      return response;
    } catch (error) {
      return handleError(error, request, startedAt);
    }
  };
}

function handleError(error: unknown, request: NextRequest, startedAt: number): NextResponse {
  const base = {
    method: request.method,
    path: new URL(request.url).pathname,
    durationMs: Date.now() - startedAt,
  };

  // Erreur métier explicite : le message est destiné au client.
  if (error instanceof HttpError) {
    logger.warn('request failed', { ...base, status: error.status, code: error.code });
    return fail(error.code, error.message, error.status, error.fields);
  }

  if (error instanceof ZodError) {
    logger.warn('validation failed', { ...base, status: 422 });
    return validationError(error);
  }

  // Violation d'index unique : renvoyée en 409 plutôt qu'en 500, car elle
  // traduit un conflit d'état côté client (email déjà pris, slug en double).
  if (error instanceof MongoServerError && error.code === 11000) {
    const field = Object.keys((error.keyPattern as Record<string, unknown>) ?? {})[0] ?? 'valeur';
    logger.warn('duplicate key', { ...base, status: 409, field });
    return fail(ErrorCode.CONFLICT, `Cette ${field} est déjà utilisée`, 409);
  }

  if (error instanceof MongooseError.ValidationError) {
    const fields: Record<string, string[]> = {};
    for (const [path, detail] of Object.entries(error.errors)) {
      fields[path] = [detail.message];
    }
    logger.warn('mongoose validation failed', { ...base, status: 422 });
    return fail(ErrorCode.VALIDATION_ERROR, 'Données invalides', 422, fields);
  }

  if (error instanceof MongooseError.CastError) {
    logger.warn('cast error', { ...base, status: 422, path: error.path });
    return fail(ErrorCode.VALIDATION_ERROR, `Valeur invalide pour « ${error.path} »`, 422);
  }

  // Tout le reste est inattendu : journalisé en détail, exposé de façon générique.
  logger.error('unhandled error', { ...base, status: 500, ...serializeError(error) });
  return internalError();
}

/** Valide le corps JSON d'une requête. Un corps absent ou malformé est une erreur 422. */
export async function parseBody<T>(request: NextRequest, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw HttpError.validation('Corps de requête JSON invalide');
  }
  return schema.parse(raw);
}

/** Valide les paramètres de requête (`?page=2&city=...`). */
export function parseQuery<T>(request: NextRequest, schema: ZodType<T>): T {
  const params = Object.fromEntries(new URL(request.url).searchParams.entries());
  return schema.parse(params);
}
