'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import type { Restaurant } from '@tourism/shared/types';

import { toFormState } from '@/lib/api/action-result';
import { api } from '@/lib/api/client';
import { buildRestaurantPayload } from '@/lib/payloads';
import type { FormState } from '@/lib/forms';

export async function createRestaurantAction(
  _previous: FormState,
  data: FormData,
): Promise<FormState> {
  let created: Restaurant;

  try {
    created = await api.post<Restaurant>('/api/restaurants', buildRestaurantPayload(data));
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath('/restaurants');
  redirect(`/restaurants/${created.id}`);
}

export async function updateRestaurantAction(
  id: string,
  _previous: FormState,
  data: FormData,
): Promise<FormState> {
  try {
    await api.put<Restaurant>(`/api/restaurants/${id}`, buildRestaurantPayload(data));
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath('/restaurants');
  revalidatePath(`/restaurants/${id}`);
  return { status: 'idle', message: 'Modifications enregistrées.' };
}

export async function deleteRestaurantAction(id: string): Promise<void> {
  await api.delete(`/api/restaurants/${id}`);
  revalidatePath('/restaurants');
  redirect('/restaurants');
}
