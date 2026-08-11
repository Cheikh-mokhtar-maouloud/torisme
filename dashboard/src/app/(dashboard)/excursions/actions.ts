'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import type { Excursion } from '@tourism/shared/types';

import { toFormState } from '@/lib/api/action-result';
import { api } from '@/lib/api/client';
import { buildExcursionPayload } from '@/lib/payloads';
import type { FormState } from '@/lib/forms';

export async function createExcursionAction(
  _previous: FormState,
  data: FormData,
): Promise<FormState> {
  let created: Excursion;

  try {
    created = await api.post<Excursion>('/api/excursions', buildExcursionPayload(data));
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath('/excursions');
  redirect(`/excursions/${created.id}`);
}

export async function updateExcursionAction(
  id: string,
  _previous: FormState,
  data: FormData,
): Promise<FormState> {
  try {
    await api.put<Excursion>(`/api/excursions/${id}`, buildExcursionPayload(data));
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath('/excursions');
  revalidatePath(`/excursions/${id}`);
  return { status: 'idle', message: 'Modifications enregistrées.' };
}

export async function deleteExcursionAction(id: string): Promise<void> {
  await api.delete(`/api/excursions/${id}`);
  revalidatePath('/excursions');
  redirect('/excursions');
}
