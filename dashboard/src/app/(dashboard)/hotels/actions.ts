'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import type { Hotel } from '@tourism/shared/types';

import { toFormState } from '@/lib/api/action-result';
import { api } from '@/lib/api/client';
import { buildHotelPayload } from '@/lib/payloads';
import { boolean, text, type FormState } from '@/lib/forms';

export async function createHotelAction(_previous: FormState, data: FormData): Promise<FormState> {
  let created: Hotel;

  try {
    created = await api.post<Hotel>('/api/hotels', buildHotelPayload(data));
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath('/hotels');
  redirect(`/hotels/${created.id}`);
}

export async function updateHotelAction(
  id: string,
  _previous: FormState,
  data: FormData,
): Promise<FormState> {
  try {
    await api.put<Hotel>(`/api/hotels/${id}`, buildHotelPayload(data));
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath('/hotels');
  revalidatePath(`/hotels/${id}`);
  return { status: 'idle', message: 'Modifications enregistrées.' };
}

/** Publication / dépublication rapide depuis la liste. */
export async function toggleHotelStatusAction(formData: FormData): Promise<void> {
  const id = text(formData, 'id');
  const publish = boolean(formData, 'publish');
  if (!id) return;

  await api.put(`/api/hotels/${id}`, { status: publish ? 'PUBLISHED' : 'DRAFT' });

  revalidatePath('/hotels');
  revalidatePath(`/hotels/${id}`);
}

export async function deleteHotelAction(id: string): Promise<void> {
  await api.delete(`/api/hotels/${id}`);
  revalidatePath('/hotels');
  redirect('/hotels');
}
