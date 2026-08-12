import { z } from 'zod';

import { NotificationType } from '../constants/enums';
import { objectIdSchema, paginationSchema } from './primitives';

export const notificationListQuerySchema = paginationSchema.extend({
  /** `true` pour ne remonter que les non-lues. */
  unreadOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});
export type NotificationListQuery = z.infer<typeof notificationListQuerySchema>;

/**
 * Diffusion d'un message par l'administration.
 *
 * `userIds` vide signifie « tous les comptes actifs ». C'est explicite dans le
 * dashboard, une diffusion générale ne devant jamais être le résultat d'un
 * champ oublié.
 */
export const broadcastNotificationSchema = z.object({
  title: z.string().trim().min(3).max(160),
  body: z.string().trim().min(3).max(1000),
  type: z.enum(NotificationType).default(NotificationType.SYSTEM),
  userIds: z.array(objectIdSchema).max(500).default([]),
  /** Doubler le message d'un email. Réservé aux annonces importantes. */
  alsoEmail: z.boolean().default(false),
});
export type BroadcastNotificationInput = z.infer<typeof broadcastNotificationSchema>;
