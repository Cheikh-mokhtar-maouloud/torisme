'use server';

import { revalidatePath } from 'next/cache';

import type { Booking } from '@tourism/shared/types';

import { toFormState } from '@/lib/api/action-result';
import { api } from '@/lib/api/client';
import { text, type FormState } from '@/lib/forms';

/**
 * Confirmation et annulation depuis l'administration.
 *
 * Les règles de transition vivent côté serveur : seule une réservation en
 * attente peut être confirmée, et une réservation terminée ne s'annule pas.
 * Le dashboard n'en est qu'un déclencheur.
 */
export async function confirmBookingAction(
  id: string,
  _previous: FormState,
  _data: FormData,
): Promise<FormState> {
  try {
    await api.patch<Booking>(`/api/bookings/${id}/confirm`, {});
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath('/bookings');
  revalidatePath(`/bookings/${id}`);
  return { status: 'idle', message: 'Réservation confirmée.' };
}

export async function cancelBookingAction(
  id: string,
  _previous: FormState,
  data: FormData,
): Promise<FormState> {
  const reason = text(data, 'reason');

  try {
    await api.patch<Booking>(`/api/bookings/${id}/cancel`, reason ? { reason } : {});
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath('/bookings');
  revalidatePath(`/bookings/${id}`);
  return { status: 'idle', message: 'Réservation annulée.' };
}
