'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import type { Room } from '@tourism/shared/types';

import { toFormState } from '@/lib/api/action-result';
import { api } from '@/lib/api/client';
import { buildRoomPayload } from '@/lib/payloads';
import { text, type FormState } from '@/lib/forms';

export async function createRoomAction(_previous: FormState, data: FormData): Promise<FormState> {
  const hotelId = text(data, 'hotelId');
  if (!hotelId) {
    return { status: 'error', message: 'Sélectionnez un hôtel.' };
  }

  let created: Room;

  try {
    created = await api.post<Room>('/api/rooms', { ...buildRoomPayload(data), hotelId });
  } catch (error) {
    return toFormState(error);
  }

  // La création d'une chambre change le prix minimum affiché sur l'hôtel :
  // les deux vues doivent être revalidées.
  revalidatePath('/rooms');
  revalidatePath(`/hotels/${hotelId}`);
  redirect(`/rooms/${created.id}`);
}

/**
 * `hotelId` n'est pas envoyé en modification : l'API le refuse, car déplacer
 * une chambre d'un hôtel à l'autre rendrait incohérentes ses réservations.
 */
export async function updateRoomAction(
  id: string,
  hotelId: string,
  _previous: FormState,
  data: FormData,
): Promise<FormState> {
  try {
    await api.put<Room>(`/api/rooms/${id}`, buildRoomPayload(data));
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath('/rooms');
  revalidatePath(`/rooms/${id}`);
  revalidatePath(`/hotels/${hotelId}`);
  return { status: 'idle', message: 'Modifications enregistrées.' };
}

export async function deleteRoomAction(id: string, hotelId: string): Promise<void> {
  await api.delete(`/api/rooms/${id}`);
  revalidatePath('/rooms');
  revalidatePath(`/hotels/${hotelId}`);
  redirect('/rooms');
}
