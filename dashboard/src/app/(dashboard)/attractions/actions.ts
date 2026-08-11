'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import type { Attraction } from '@tourism/shared/types';

import { toFormState } from '@/lib/api/action-result';
import { api } from '@/lib/api/client';
import { buildAttractionPayload } from '@/lib/payloads';
import type { FormState } from '@/lib/forms';

export async function createAttractionAction(
  _previous: FormState,
  data: FormData,
): Promise<FormState> {
  let created: Attraction;

  try {
    created = await api.post<Attraction>('/api/attractions', buildAttractionPayload(data));
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath('/attractions');
  redirect(`/attractions/${created.id}`);
}

export async function updateAttractionAction(
  id: string,
  _previous: FormState,
  data: FormData,
): Promise<FormState> {
  try {
    await api.put<Attraction>(`/api/attractions/${id}`, buildAttractionPayload(data));
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath('/attractions');
  revalidatePath(`/attractions/${id}`);
  return { status: 'idle', message: 'Modifications enregistrées.' };
}

export async function deleteAttractionAction(id: string): Promise<void> {
  await api.delete(`/api/attractions/${id}`);
  revalidatePath('/attractions');
  redirect('/attractions');
}
