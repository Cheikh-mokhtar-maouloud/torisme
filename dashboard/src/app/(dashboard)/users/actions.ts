'use server';

import { revalidatePath } from 'next/cache';

import { UserRole } from '@tourism/shared/constants';
import type { User } from '@tourism/shared/types';

import { toFormState } from '@/lib/api/action-result';
import { api } from '@/lib/api/client';
import { boolean, text, type FormState } from '@/lib/forms';

/**
 * Activation / désactivation depuis la liste.
 *
 * L'API refuse qu'un administrateur se désactive lui-même ou retire le dernier
 * rôle administrateur actif : le contrôle est côté serveur, pas ici, pour qu'il
 * s'applique aussi aux appels directs à l'API.
 */
export async function toggleUserActiveAction(
  _previous: FormState,
  data: FormData,
): Promise<FormState> {
  const id = text(data, 'id');
  if (!id) return { status: 'error', message: 'Utilisateur introuvable.' };

  try {
    await api.patch<User>(`/api/users/${id}`, { isActive: boolean(data, 'isActive') });
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath('/users');
  revalidatePath(`/users/${id}`);
  return { status: 'idle' };
}

export async function updateUserAction(
  id: string,
  _previous: FormState,
  data: FormData,
): Promise<FormState> {
  const role = text(data, 'role');

  try {
    await api.patch<User>(`/api/users/${id}`, {
      fullName: text(data, 'fullName'),
      phone: text(data, 'phone'),
      role: role === UserRole.ADMIN || role === UserRole.USER ? role : undefined,
      isActive: boolean(data, 'isActive'),
    });
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath('/users');
  revalidatePath(`/users/${id}`);
  return { status: 'idle', message: 'Compte mis à jour.' };
}
