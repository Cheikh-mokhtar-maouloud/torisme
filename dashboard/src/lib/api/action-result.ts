import { ApiRequestError } from './client';
import type { FormState } from '../forms';

/**
 * Traduit une erreur d'API en état de formulaire.
 *
 * Toutes les server actions passent par ici : une erreur inattendue doit
 * remonter (et être visible dans les logs), tandis qu'une erreur applicative
 * — validation, conflit, droits — s'affiche dans le formulaire.
 */
export function toFormState(error: unknown): FormState {
  if (error instanceof ApiRequestError) {
    return {
      status: 'error',
      message: error.message,
      ...(error.fields ? { fields: error.fields } : {}),
    };
  }

  // Ne pas avaler ce qu'on ne comprend pas : un bug silencieux coûte plus cher
  // qu'une page d'erreur.
  throw error;
}
