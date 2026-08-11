import 'server-only';

import { redirect } from 'next/navigation';

import { UserRole } from '@tourism/shared/constants';
import type { User } from '@tourism/shared/types';

import { api, ApiRequestError } from '../api/client';
import { getSessionToken } from './session';

/**
 * Vérifie que la requête provient d'un administrateur connecté.
 *
 * Appelée par le layout de la zone protégée : chaque rendu revalide la session
 * auprès du backend, si bien qu'un compte désactivé perd l'accès immédiatement
 * plutôt qu'à l'expiration du jeton.
 *
 * Le cookie périmé n'est **pas** effacé ici : Next interdit d'écrire un cookie
 * pendant le rendu d'un composant serveur (uniquement dans une server action ou
 * un route handler). On redirige donc vers `/login`, où la connexion écrasera
 * le cookie ; le middleware laisse passer cette page lorsqu'une erreur de
 * session est signalée, sans quoi un cookie invalide provoquerait une boucle.
 */
export async function requireAdmin(): Promise<User> {
  const token = await getSessionToken();
  if (!token) redirect('/login');

  let user: User;

  try {
    user = await api.get<User>('/api/auth/me');
  } catch (error) {
    if (error instanceof ApiRequestError && error.isUnauthorized) {
      redirect('/login?error=expired');
    }
    throw error;
  }

  if (user.role !== UserRole.ADMIN) {
    redirect('/login?error=forbidden');
  }

  return user;
}
