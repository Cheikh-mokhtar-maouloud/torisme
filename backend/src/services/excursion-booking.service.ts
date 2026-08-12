import { randomBytes } from 'node:crypto';

import {
  BookingStatus,
  ErrorCode,
  ExcursionStatus,
  NotificationType,
  SOCKET_EVENTS,
  UserRole,
} from '@tourism/shared/constants';
import type { ExcursionBooking as ExcursionBookingDto } from '@tourism/shared/types';
import type {
  CreateExcursionBookingInput,
  ExcursionBookingListQuery,
} from '@tourism/shared/validation';

import { HttpError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { escapeRegex, paginateQuery, type PaginatedResult } from '@/lib/query';
import { publish } from '@/lib/realtime';
import { serializeDocument } from '@/lib/serialize';
import { bookingCancelledEmail, bookingConfirmedEmail } from '@/lib/mail/templates';
import { Excursion, ExcursionBooking, User } from '@/models';

import { notify, notifyAdmins } from './notification.service';

/** Statuts qui immobilisent des places. Une annulation les restitue. */
const BLOCKING_STATUSES = [BookingStatus.PENDING, BookingStatus.CONFIRMED];

function generateReference(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (const byte of randomBytes(6)) suffix += alphabet[byte % alphabet.length];
  return `EX-${suffix}`;
}

/**
 * Réserve des places sur une excursion.
 *
 * Contrairement à l'hébergement, la contrainte tient **dans un seul document** :
 * `availableSeats`. Un `findOneAndUpdate` conditionné à `$gte` est donc
 * atomique par construction — MongoDB garantit qu'un document n'est modifié que
 * par une opération à la fois. Aucun verrou n'est nécessaire ici, là où le
 * comptage des chevauchements de dates en exigeait un (Phase 8).
 *
 * La condition porte aussi sur le statut et la date : une excursion annulée ou
 * déjà passée ne doit pas pouvoir être réservée, et vérifier ces points
 * séparément rouvrirait la fenêtre que l'atomicité vient de fermer.
 */
export async function createExcursionBooking(
  userId: string,
  input: CreateExcursionBookingInput,
): Promise<ExcursionBookingDto> {
  const now = new Date();

  const excursion = await Excursion.findOneAndUpdate(
    {
      _id: input.excursionId,
      availableSeats: { $gte: input.seats },
      status: { $in: [ExcursionStatus.SCHEDULED, ExcursionStatus.FULL] },
      startsAt: { $gt: now },
    },
    { $inc: { availableSeats: -input.seats } },
    // `new: false` : on récupère l'état **avant** décrément, ce qui donne le
    // prix et la devise au moment de la réservation.
    { new: false },
  ).lean();

  if (!excursion) {
    // L'échec peut venir de trois causes ; on les distingue par une relecture,
    // uniquement pour produire un message utile.
    throw await explainFailure(input.excursionId, now);
  }

  const remaining = excursion.availableSeats - input.seats;

  try {
    const created = await ExcursionBooking.create({
      reference: generateReference(),
      userId,
      excursionId: excursion._id,
      seats: input.seats,
      unitPrice: excursion.price,
      totalPrice: excursion.price * input.seats,
      currency: excursion.currency,
      status: BookingStatus.PENDING,
    });

    // Les places étant épuisées, l'excursion sort des listes réservables.
    if (remaining === 0) {
      await Excursion.updateOne(
        { _id: excursion._id, status: ExcursionStatus.SCHEDULED },
        { $set: { status: ExcursionStatus.FULL } },
      );
    }

    /*
     * Les places restantes sont la donnée la plus volatile de la plateforme :
     * c'est précisément celle qu'un utilisateur regarde en hésitant. La
     * diffusion vise les administrateurs — le dashboard suit ainsi le
     * remplissage — tandis que les clients rafraîchissent leur fiche à
     * l'ouverture.
     */
    void publish(
      SOCKET_EVENTS.EXCURSION_SEATS_UPDATED,
      { kind: 'admins' },
      { excursionId: String(excursion._id), availableSeats: remaining },
    );

    void notifyAdmins(
      'Nouvelle réservation d’excursion',
      `${created.reference} — ${excursion.title}, ${input.seats} place(s)`,
      { excursionBookingId: String(created._id) },
    );

    return serializeDocument<ExcursionBookingDto>(created.toObject());
  } catch (error) {
    /*
     * Compensation : les places ont été décrémentées avant la création de la
     * réservation. Si celle-ci échoue, elles doivent être rendues — sans quoi
     * l'excursion afficherait des places vendues qui n'existent pas.
     */
    await Excursion.updateOne({ _id: excursion._id }, { $inc: { availableSeats: input.seats } });
    logger.error('places restituées après échec de création', {
      excursionId: String(excursion._id),
      seats: input.seats,
    });
    throw error;
  }
}

/** Relit l'excursion pour expliquer un refus. Appelée uniquement en cas d'échec. */
async function explainFailure(excursionId: string, now: Date): Promise<HttpError> {
  const excursion = await Excursion.findById(excursionId).lean();

  if (!excursion) return HttpError.notFound('Excursion introuvable');

  if (excursion.status === ExcursionStatus.CANCELLED) {
    return HttpError.conflict('Cette excursion a été annulée');
  }

  if (excursion.status === ExcursionStatus.COMPLETED || excursion.startsAt <= now) {
    return HttpError.conflict('Cette excursion est déjà passée');
  }

  if (excursion.availableSeats === 0) {
    return new HttpError(ErrorCode.EXCURSION_FULL, 'Cette excursion est complète', 409);
  }

  return new HttpError(
    ErrorCode.EXCURSION_FULL,
    `Il ne reste que ${excursion.availableSeats} place(s) sur cette excursion`,
    409,
  );
}

export async function listExcursionBookings(
  query: ExcursionBookingListQuery,
  actor: { userId: string; role: UserRole },
): Promise<PaginatedResult<ExcursionBookingDto>> {
  const filter: Record<string, unknown> = {};

  // Un utilisateur ne voit que ses propres réservations.
  if (actor.role !== UserRole.ADMIN) filter.userId = actor.userId;

  if (query.status) filter.status = query.status;
  if (query.excursionId) filter.excursionId = query.excursionId;

  if (query.search && actor.role === UserRole.ADMIN) {
    filter.reference = { $regex: escapeRegex(query.search), $options: 'i' };
  }

  return paginateQuery(
    ExcursionBooking,
    filter,
    { page: query.page, limit: query.limit, sort: { createdAt: -1 } },
    (doc) => serializeDocument<ExcursionBookingDto>(doc),
  );
}

export async function getExcursionBookingById(
  id: string,
  actor: { userId: string; role: UserRole },
): Promise<ExcursionBookingDto> {
  const booking = await ExcursionBooking.findById(id).lean();
  if (!booking) throw HttpError.notFound('Réservation introuvable');

  // 404 plutôt que 403 : répondre « interdit » confirmerait l'existence de la
  // ressource et permettrait de les énumérer.
  if (actor.role !== UserRole.ADMIN && String(booking.userId) !== actor.userId) {
    throw HttpError.notFound('Réservation introuvable');
  }

  return serializeDocument<ExcursionBookingDto>(booking);
}

/**
 * Annule une réservation et **restitue les places**.
 *
 * Le changement de statut est conditionné aux statuts bloquants : deux
 * annulations simultanées ne peuvent pas rendre les places deux fois.
 */
export async function cancelExcursionBooking(
  id: string,
  actor: { userId: string; role: UserRole },
  reason?: string,
): Promise<ExcursionBookingDto> {
  const booking = await ExcursionBooking.findById(id).lean();
  if (!booking) throw HttpError.notFound('Réservation introuvable');

  if (actor.role !== UserRole.ADMIN && String(booking.userId) !== actor.userId) {
    throw HttpError.notFound('Réservation introuvable');
  }

  if (booking.status === BookingStatus.CANCELLED) {
    throw HttpError.conflict('Cette réservation est déjà annulée');
  }

  if (booking.status === BookingStatus.COMPLETED) {
    throw HttpError.conflict('Une excursion terminée ne peut pas être annulée');
  }

  const cancelled = await ExcursionBooking.findOneAndUpdate(
    { _id: id, status: { $in: BLOCKING_STATUSES } },
    {
      $set: {
        status: BookingStatus.CANCELLED,
        cancelledAt: new Date(),
        ...(reason ? { cancellationReason: reason } : {}),
      },
    },
    { new: true },
  ).lean();

  if (!cancelled) throw HttpError.conflict('Cette réservation ne peut plus être annulée');

  await releaseSeats(String(booking.excursionId), booking.seats);

  void publish(
    SOCKET_EVENTS.BOOKING_UPDATED,
    { kind: 'user', userId: String(cancelled.userId) },
    { excursionBookingId: String(cancelled._id), status: cancelled.status },
  );

  const description = await describeExcursionBooking(cancelled);

  void notify({
    userId: String(cancelled.userId),
    type: NotificationType.BOOKING_CANCELLED,
    title: 'Réservation d’excursion annulée',
    body: `${cancelled.reference} — ${description.title}`,
    data: { excursionBookingId: String(cancelled._id) },
    ...(description.email
      ? {
          email: bookingCancelledEmail(description.email, {
            reference: cancelled.reference,
            placeName: description.title,
            ...(reason ? { reason } : {}),
          }),
        }
      : {}),
  });

  return serializeDocument<ExcursionBookingDto>(cancelled);
}

/** Libellés partagés par les notifications d'excursion. */
async function describeExcursionBooking(booking: {
  excursionId: unknown;
  userId: unknown;
}): Promise<{ email: string; title: string; when: string }> {
  const [excursion, user] = await Promise.all([
    Excursion.findById(booking.excursionId).select('title startsAt').lean(),
    User.findById(booking.userId).select('email').lean(),
  ]);

  return {
    email: user?.email ?? '',
    title: excursion?.title ?? 'Excursion',
    when: excursion?.startsAt
      ? excursion.startsAt.toISOString().slice(0, 16).replace('T', ' ')
      : '',
  };
}

/**
 * Rend des places à une excursion.
 *
 * Le plafond `totalSeats` est respecté par une seconde écriture conditionnelle
 * plutôt que par un simple `$inc` : une incohérence antérieure ne doit pas
 * pouvoir faire dépasser la capacité réelle du véhicule.
 *
 * Une excursion redevenue non complète repasse en « programmée » — sans quoi
 * elle resterait invisible alors que des places se sont libérées.
 */
async function releaseSeats(excursionId: string, seats: number): Promise<void> {
  const excursion = await Excursion.findByIdAndUpdate(
    excursionId,
    { $inc: { availableSeats: seats } },
    { new: true },
  ).lean();

  if (!excursion) return;

  if (excursion.availableSeats > excursion.totalSeats) {
    logger.warn('places restituées au-delà de la capacité, plafonnement appliqué', {
      excursionId,
      availableSeats: excursion.availableSeats,
      totalSeats: excursion.totalSeats,
    });
    await Excursion.updateOne(
      { _id: excursionId },
      { $set: { availableSeats: excursion.totalSeats } },
    );
  }

  if (excursion.availableSeats > 0 && excursion.status === ExcursionStatus.FULL) {
    await Excursion.updateOne(
      { _id: excursionId, status: ExcursionStatus.FULL },
      { $set: { status: ExcursionStatus.SCHEDULED } },
    );
  }
}

export async function confirmExcursionBooking(id: string): Promise<ExcursionBookingDto> {
  const confirmed = await ExcursionBooking.findOneAndUpdate(
    { _id: id, status: BookingStatus.PENDING },
    { $set: { status: BookingStatus.CONFIRMED } },
    { new: true },
  ).lean();

  if (!confirmed) throw HttpError.conflict('Seule une réservation en attente peut être confirmée');

  const description = await describeExcursionBooking(confirmed);

  void publish(
    SOCKET_EVENTS.BOOKING_UPDATED,
    { kind: 'user', userId: String(confirmed.userId) },
    { excursionBookingId: String(confirmed._id), status: confirmed.status },
  );

  void notify({
    userId: String(confirmed.userId),
    type: NotificationType.BOOKING_CONFIRMED,
    title: 'Participation confirmée',
    body: `${confirmed.reference} — ${description.title}`,
    data: { excursionBookingId: String(confirmed._id) },
    ...(description.email
      ? {
          email: bookingConfirmedEmail(description.email, {
            reference: confirmed.reference,
            placeName: description.title,
            when: description.when,
            total: `${confirmed.totalPrice} ${confirmed.currency}`,
          }),
        }
      : {}),
  });

  return serializeDocument<ExcursionBookingDto>(confirmed);
}
