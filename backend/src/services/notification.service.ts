import { NotificationType, SOCKET_EVENTS, UserRole } from '@tourism/shared/constants';
import type { Notification as NotificationDto } from '@tourism/shared/types';
import type { BroadcastNotificationInput, NotificationListQuery } from '@tourism/shared/validation';

import { HttpError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { mailer } from '@/lib/mail';
import type { MailMessage } from '@/lib/mail';
import { paginateQuery, type PaginatedResult } from '@/lib/query';
import { enqueueMail } from '@/lib/queue';
import { publish } from '@/lib/realtime';
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
    const created = await Notification.create({
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      ...(input.data ? { data: input.data } : {}),
    });

    /*
     * Diffusion instantanée vers l'appareil de l'utilisateur, s'il est connecté.
     * La notification est déjà enregistrée : un service temps réel arrêté ne
     * fait perdre que l'immédiateté, pas l'information.
     */
    void publish(
      SOCKET_EVENTS.NOTIFICATION_NEW,
      { kind: 'user', userId: input.userId },
      {
        id: String(created._id),
        type: input.type,
        title: input.title,
        body: input.body,
        ...(input.data ?? {}),
      },
    );
  } catch (error) {
    logger.error('notification in-app non enregistrée', {
      userId: input.userId,
      type: input.type,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }

  if (input.email) await sendEmail(input.email);
}

/**
 * Envoi d'email, jamais propagé à l'appelant.
 *
 * Depuis la Phase 13, le message est **déposé en file** : BullMQ le réessaie
 * avec un délai croissant, et un échec définitif reste consultable au lieu de
 * disparaître dans les journaux. C'est ce que promettait le commentaire de
 * `notify` depuis la Phase 9.
 *
 * Sans Redis, le repli est l'envoi direct — le comportement d'avant cette
 * phase, donc aucune régression.
 */
export async function sendEmail(message: MailMessage): Promise<void> {
  try {
    await enqueueMail(message, () => deliverEmail(message));
  } catch (error) {
    logger.error('email non traité', {
      subject: message.subject,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Remise effective au fournisseur.
 *
 * Contrairement à `sendEmail`, cette fonction **lève** en cas d'échec : c'est
 * indispensable pour que le worker considère la tâche comme ratée et la
 * réessaie. Avaler l'erreur ici ferait marquer « réussie » une tâche dont
 * l'email n'est jamais parti, ce qui viderait la file de tout son intérêt.
 */
export async function deliverEmail(message: MailMessage): Promise<void> {
  await mailer().send(message);
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

  // La salle « admins » permet au dashboard de réagir sans que chaque
  // administrateur ait à être identifié individuellement.
  void publish(SOCKET_EVENTS.ADMIN_ACTIVITY, { kind: 'admins' }, { title, body, ...(data ?? {}) });
}
