'use server';

import { NotificationType } from '@tourism/shared/constants';

import { toFormState } from '@/lib/api/action-result';
import { api } from '@/lib/api/client';
import { boolean, text, type FormState } from '@/lib/forms';

/**
 * Diffusion d'un message.
 *
 * La portée est un choix explicite du formulaire : une diffusion à tous les
 * comptes ne doit jamais résulter d'un champ laissé vide par inadvertance.
 */
export async function broadcastAction(_previous: FormState, data: FormData): Promise<FormState> {
  const title = text(data, 'title');
  const body = text(data, 'body');
  const audience = text(data, 'audience');

  if (!title || !body) {
    return { status: 'error', message: 'Titre et message sont requis.' };
  }

  if (audience !== 'all') {
    return {
      status: 'error',
      message: 'Confirmez la portée du message avant de l’envoyer.',
    };
  }

  let result: { recipients: number };

  try {
    result = await api.post<{ recipients: number }>('/api/admin/notifications', {
      title,
      body,
      type: NotificationType.SYSTEM,
      userIds: [],
      alsoEmail: boolean(data, 'alsoEmail'),
    });
  } catch (error) {
    return toFormState(error);
  }

  return {
    status: 'idle',
    message: `Message envoyé à ${result.recipients} compte${result.recipients > 1 ? 's' : ''}.`,
  };
}
