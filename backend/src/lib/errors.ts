import { ErrorCode } from '@tourism/shared/constants';

/**
 * Erreur métier portant son code et son statut HTTP.
 *
 * Les services lèvent des `HttpError` ; le wrapper de route les convertit en
 * réponse. Toute autre exception est traitée comme une erreur interne dont le
 * détail n'est jamais exposé au client — un message de base de données peut
 * révéler la structure du schéma.
 */
export class HttpError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly fields?: Record<string, string[]>;

  constructor(code: ErrorCode, message: string, status: number, fields?: Record<string, string[]>) {
    super(message);
    this.name = 'HttpError';
    this.code = code;
    this.status = status;
    if (fields) this.fields = fields;
  }

  static unauthorized(message = 'Authentification requise') {
    return new HttpError(ErrorCode.UNAUTHORIZED, message, 401);
  }

  static forbidden(message = 'Accès refusé') {
    return new HttpError(ErrorCode.FORBIDDEN, message, 403);
  }

  static notFound(message = 'Ressource introuvable') {
    return new HttpError(ErrorCode.NOT_FOUND, message, 404);
  }

  static conflict(message: string) {
    return new HttpError(ErrorCode.CONFLICT, message, 409);
  }

  static validation(message: string, fields?: Record<string, string[]>) {
    return new HttpError(ErrorCode.VALIDATION_ERROR, message, 422, fields);
  }
}
