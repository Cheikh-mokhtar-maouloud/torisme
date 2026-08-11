'use server';

import { redirect } from 'next/navigation';

import { UserRole } from '@tourism/shared/constants';
import type { User } from '@tourism/shared/types';

import { api, ApiRequestError } from '@/lib/api/client';
import { clearSessionToken, setSessionToken } from '@/lib/auth/session';
import { type FormState, text } from '@/lib/forms';

interface LoginResult {
  user: User;
  token: string;
}

/**
 * Connexion administrateur.
 *
 * L'appel au backend part du serveur Next : le jeton n'atteint jamais le
 * navigateur, seul le cookie de session du dashboard est posé.
 */
export async function loginAction(_previous: FormState, data: FormData): Promise<FormState> {
  const email = text(data, 'email');
  const password = text(data, 'password');

  if (!email || !password) {
    return { status: 'error', message: 'Email et mot de passe sont requis.' };
  }

  let result: LoginResult;

  try {
    result = await api.post<LoginResult>('/api/auth/login', { email, password });
  } catch (error) {
    if (error instanceof ApiRequestError) {
      return {
        status: 'error',
        message: error.message,
        ...(error.fields ? { fields: error.fields } : {}),
      };
    }
    throw error;
  }

  // Le dashboard est réservé aux administrateurs : un compte touriste valide
  // ne doit pas obtenir de session ici, même si ses identifiants sont corrects.
  if (result.user.role !== UserRole.ADMIN) {
    return {
      status: 'error',
      message: 'Ce compte n’a pas accès à l’administration.',
    };
  }

  await setSessionToken(result.token);

  // `redirect` lève une exception de contrôle interne à Next : il doit être
  // appelé hors du bloc try, sinon le catch l'intercepterait comme une erreur.
  redirect('/');
}

export async function logoutAction(): Promise<void> {
  await clearSessionToken();
  redirect('/login');
}
