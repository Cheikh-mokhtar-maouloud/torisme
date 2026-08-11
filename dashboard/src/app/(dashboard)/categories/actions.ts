'use server';

import { revalidatePath } from 'next/cache';

import type { Category } from '@tourism/shared/types';

import { toFormState } from '@/lib/api/action-result';
import { api } from '@/lib/api/client';
import { boolean, text, type FormState } from '@/lib/forms';
import { slugify } from '@/lib/slug';

export async function createCategoryAction(
  _previous: FormState,
  data: FormData,
): Promise<FormState> {
  const name = text(data, 'name');
  const appliesTo = text(data, 'appliesTo');

  if (!name || !appliesTo) {
    return { status: 'error', message: 'Nom et type de lieu sont requis.' };
  }

  try {
    await api.post<Category>('/api/categories', {
      // Le slug est dérivé du nom quand il n'est pas saisi : il sert d'identifiant
      // stable dans les URL de filtre, indépendamment des renommages ultérieurs.
      name,
      slug: text(data, 'slug') ?? slugify(name),
      appliesTo,
      isActive: true,
    });
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath('/categories');
  return { status: 'idle', message: `Catégorie « ${name} » créée.` };
}

/**
 * Bascule d'activation.
 *
 * Une catégorie encore rattachée à des fiches ne peut pas être supprimée
 * (l'API renvoie 409) : la désactivation est la manœuvre normale pour la
 * retirer des filtres sans casser les fiches existantes.
 */
export async function toggleCategoryAction(data: FormData): Promise<void> {
  const id = text(data, 'id');
  if (!id) return;

  await api.put(`/api/categories/${id}`, { isActive: boolean(data, 'isActive') });
  revalidatePath('/categories');
}

export async function deleteCategoryAction(data: FormData): Promise<void> {
  const id = text(data, 'id');
  if (!id) return;

  await api.delete(`/api/categories/${id}`);
  revalidatePath('/categories');
}
