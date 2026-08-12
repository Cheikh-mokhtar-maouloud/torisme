'use server';

import { revalidatePath } from 'next/cache';

import { ReviewStatus } from '@tourism/shared/constants';
import type { Review } from '@tourism/shared/types';

import { toFormState } from '@/lib/api/action-result';
import { api } from '@/lib/api/client';
import { text, type FormState } from '@/lib/forms';

/**
 * Modération des avis.
 *
 * Approuver ou rejeter déclenche côté serveur le recalcul de la note du lieu :
 * le dashboard n'a rien à recalculer lui-même.
 */
async function moderate(id: string, status: ReviewStatus, reason?: string): Promise<FormState> {
  try {
    await api.patch<Review>(`/api/reviews/${id}/moderate`, {
      status,
      ...(reason ? { reason } : {}),
    });
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath('/reviews');
  return { status: 'idle' };
}

export async function approveReviewAction(
  id: string,
  _previous: FormState,
  _data: FormData,
): Promise<FormState> {
  return moderate(id, ReviewStatus.APPROVED);
}

export async function rejectReviewAction(
  id: string,
  _previous: FormState,
  data: FormData,
): Promise<FormState> {
  return moderate(id, ReviewStatus.REJECTED, text(data, 'reason'));
}

/**
 * Suppression définitive.
 *
 * À réserver aux contenus illégaux : rejeter suffit à retirer un avis de
 * l'affichage tout en gardant une trace de la décision.
 */
export async function deleteReviewAction(data: FormData): Promise<void> {
  const id = text(data, 'id');
  if (!id) return;

  await api.delete(`/api/reviews/${id}`);
  revalidatePath('/reviews');
}
