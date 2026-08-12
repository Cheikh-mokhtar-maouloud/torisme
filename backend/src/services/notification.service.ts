import { NotificationType, UserRole } from '@tourism/shared/constants';
import type { Notification as NotificationDto } from '@tourism/shared/types';
import type { BroadcastNotificationInput, NotificationListQuery } from '@tourism/shared/validation';

import { HttpError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { mailer } from '@/lib/mail';
import type { MailMessage } from '@/lib/mail';
import { paginateQuery, type PaginatedResult } from '@/lib/query';
import { serializeDocument } from '@/lib/serialize';
import { Notification, User } from '@/models';

/* -------------------------------------------------------------------------- */
/* Boîte de réception                                                          */
/* -------------------------------------------------------------------------- */

export async function listNotifications(
  userId: string,
  query: NotificationListQuery,
): Promise<PaginatedResult<NotificationDto>> {
  const filter: Record<string, unknown> = { userId };
  if (query.unreadOnly) filter.readAt = null;

  return paginateQuery(
    Notification,
    filter,
    { page: query.page, limit: query.limit, sort: { createdAt: -1 } },
    (doc) => serializeDocument<NotificationDto>(doc),
  );
}

export async function countUnread(userId: string): Promise<number> {
  return Notification.countDocuments({ userId, readAt: null });
}

export async function markAsRead(id: string, userId: string): Promise<NotificationDto> {
  // Le filtre porte sur `userId` : impossible de marquer la notification d'un autre.
  const updated = await Notification.findOneAndUpdate(
    { _id: id, userId },
    { $set: { readAt: new Date() } },
    { new: true },
  ).lean();

  if (!updated) throw HttpError.notFound('Notification introuvable');
  return serializeDocument<NotificationDto>(updated);
}

export async function markAllAsRead(userId: string): Promise<number> {
  const result = await Notification.updateMany(
    { userId, readAt: null },
    { $set: { readAt: new Date() } },
  );
  return result.modifiedCount;
}

/* -------------------------------------------------------------------------- */
/* Émission                                                                    */
/* -------------------------------------------------------------------------- */

interface NotifyInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, string>;
  /** Email à envoyer en plus de la notification in-app. */
  email?: MailMessage;
}

/**
 * Émet une notification.
 *
 * **Ne lève jamais.** Une confirmation de réservation ne doit pas échouer parce
 * que le serveur d'emails est indisponible : l'opération métier a réussi, seule
 * l'information n'est pas partie. L'échec est journalisé, pas propagé.
 *
 * Corollaire assumé : une notification peut être perdue. La livraison durable
 * — file d'attente, réessais, lettres mortes — arrive en Phase 13 avec BullMQ ;
 * `notify` deviendra alors un simple dépôt en file.
 */
export async function notify(input: NotifyInput): Promise<void> {
  try {
    await Notification.create({
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      ...(input.data ? { data: input.data } : {}),
    });
  } catch (error) {
    logger.error('notification in-app non enregistrée', {
      userId: input.userId,
      type: input.type,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }

  if (input.email) await sendEmail(input.email);
}

/** Envoi d'email isolé, jamais propagé à l'appelant. */
export async function sendEmail(message: MailMessage): Promise<void> {
  try {
    await mailer().send(message);
  } catch (error) {
    logger.error('email non envoyé', {
      subject: message.subject,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }
}

/* -------------------------------------------------------------------------- */
/* Diffusion administrative                                                    */
/* -------------------------------------------------------------------------- */

export async function broadcast(
  input: BroadcastNotificationInput,
): Promise<{ recipients: number }> {
  /*
   * Sans destinataires explicites, la diffusion vise tous les comptes actifs.
   * Les comptes désactivés en sont exclus : leur écrire n'aurait aucun sens et
   * gonflerait la facture d'envoi.
   */
  const recipients =
    input.userIds.length > 0
      ? await User.find({ _id: { $in: input.userIds }, isActive: true })
          .select('_id email fullName')
          .lean()
      : await User.find({ isActive: true }).select('_id email fullName').lean();

  if (recipients.length === 0) return { recipients: 0 };

  // `insertMany` plutôt qu'une boucle : une seule écriture pour l'ensemble.
  await Notification.insertMany(
    recipients.map((user) => ({
      userId: user._id,
      type: input.type,
      title: input.title,
      body: input.body,
    })),
  );

  if (input.alsoEmail) {
    /*
     * Les envois sont séquentiels, pas parallèles : un `Promise.all` sur des
     * centaines d'adresses dépasserait les limites de débit du fournisseur et
     * ferait rejeter la plupart des messages.
     *
     * Une vraie diffusion massive relève de la file d'attente (Phase 13), qui
     * étalera les envois et réessaiera les échecs.
     */
    for (const user of recipients) {
      await sendEmail({
        to: user.email,
        subject: input.title,
        text: `Bonjour ${user.fullName},\n\n${input.body}`,
      });
    }
  }

  logger.info('diffusion envoyée', {
    recipients: recipients.length,
    withEmail: input.alsoEmail,
  });

  return { recipients: recipients.length };
}

/** Notifie tous les administrateurs actifs — nouvelle demande, avis signalé… */
export async function notifyAdmins(
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<void> {
  const admins = await User.find({ role: UserRole.ADMIN, isActive: true }).select('_id').lean();

  await Promise.all(
    admins.map((admin) =>
      notify({
        userId: String(admin._id),
        type: NotificationType.SYSTEM,
        title,
        body,
        ...(data ? { data } : {}),
      }),
    ),
  );
}
