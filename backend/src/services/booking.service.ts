import { randomBytes } from 'node:crypto';

import {
  BookingStatus,
  ContentStatus,
  ErrorCode,
  NotificationType,
  SOCKET_EVENTS,
  UserRole,
} from '@tourism/shared/constants';
import type { Booking as BookingDto } from '@tourism/shared/types';
import {
  countNights,
  startOfUtcDay,
  type BookingListQuery,
  type CreateBookingInput,
} from '@tourism/shared/validation';

import { HttpError } from '@/lib/errors';
import { escapeRegex, paginateQuery, type PaginatedResult } from '@/lib/query';
import { publish } from '@/lib/realtime';
import { withRoomLock } from '@/lib/room-lock';
import { bookingCancelledEmail, bookingConfirmedEmail } from '@/lib/mail/templates';
import { serializeDocument } from '@/lib/serialize';
import { Booking, Hotel, Room, User } from '@/models';

import { notify, notifyAdmins } from './notification.service';

/**
 * Statuts qui immobilisent une unité de chambre.
 * Une réservation annulée libère la sienne ; une réservation terminée concerne
 * une période passée et ne peut pas chevaucher une demande future.
 */
const BLOCKING_STATUSES = [BookingStatus.PENDING, BookingStatus.CONFIRMED];

/**
 * Compte les unités déjà prises sur une période.
 *
 * Deux séjours se chevauchent si `checkIn < autre.checkOut` **et**
 * `checkOut > autre.checkIn`. Les bornes strictes sont importantes : un départ
 * le 12 et une arrivée le 12 portent sur des nuits différentes et ne se
 * chevauchent pas — la chambre est libérée le matin.
 */
async function countOverlapping(
  roomId: string,
  checkIn: Date,
  checkOut: Date,
  excludeBookingId?: string,
): Promise<number> {
  return Booking.countDocuments({
    roomId,
    status: { $in: BLOCKING_STATUSES },
    checkIn: { $lt: checkOut },
    checkOut: { $gt: checkIn },
    ...(excludeBookingId ? { _id: { $ne: excludeBookingId } } : {}),
  });
}

export interface AvailabilityResult {
  roomId: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  totalUnits: number;
  bookedUnits: number;
  availableUnits: number;
  isAvailable: boolean;
  unitPrice: number;
  totalPrice: number;
  currency: string;
}

export async function checkAvailability(
  roomId: string,
  checkInInput: Date,
  checkOutInput: Date,
): Promise<AvailabilityResult> {
  const checkIn = startOfUtcDay(checkInInput);
  const checkOut = startOfUtcDay(checkOutInput);

  const room = await Room.findById(roomId).lean();
  if (!room || room.status !== ContentStatus.PUBLISHED) {
    throw HttpError.notFound('Chambre introuvable');
  }

  const bookedUnits = await countOverlapping(roomId, checkIn, checkOut);
  const availableUnits = Math.max(0, room.totalUnits - bookedUnits);
  const nights = countNights(checkIn, checkOut);

  return {
    roomId,
    checkIn: checkIn.toISOString(),
    checkOut: checkOut.toISOString(),
    nights,
    totalUnits: room.totalUnits,
    bookedUnits,
    availableUnits,
    isAvailable: availableUnits > 0,
    unitPrice: room.pricePerNight,
    // Le total est calculé **ici**, jamais côté client : un prix envoyé par
    // l'application serait modifiable par n'importe qui.
    totalPrice: room.pricePerNight * nights,
    currency: room.currency,
  };
}

/** Référence courte et lisible, sans caractères ambigus à l'oral. */
function generateReference(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(6);
  let suffix = '';
  for (const byte of bytes) suffix += alphabet[byte % alphabet.length];
  return `TP-${suffix}`;
}

export async function createBooking(
  userId: string,
  input: CreateBookingInput,
): Promise<BookingDto> {
  const checkIn = startOfUtcDay(input.checkIn);
  const checkOut = startOfUtcDay(input.checkOut);

  const room = await Room.findById(input.roomId).lean();
  if (!room || room.status !== ContentStatus.PUBLISHED) {
    throw HttpError.notFound('Chambre introuvable');
  }

  if (input.guests > room.capacity) {
    throw HttpError.validation('Trop de voyageurs pour cette chambre', {
      guests: [`Cette chambre accueille au maximum ${room.capacity} personne(s)`],
    });
  }

  const hotel = await Hotel.findById(room.hotelId).lean();
  if (!hotel || hotel.status !== ContentStatus.PUBLISHED) {
    throw HttpError.notFound('Hôtel introuvable');
  }

  const nights = countNights(checkIn, checkOut);

  /*
   * Comptage et insertion sous verrou.
   *
   * Ces deux opérations doivent être indivisibles : exécutées sans protection,
   * deux requêtes simultanées voient toutes deux la dernière unité libre et la
   * réservent. Le verrou porte sur la chambre — deux chambres différentes se
   * réservent donc toujours en parallèle.
   *
   * Le choix d'un verrou plutôt que d'une transaction est délibéré : il ne
   * requiert pas de replica set, et se comporte donc de façon identique sur une
   * instance locale et sur Atlas. Voir `lib/room-lock.ts`.
   */
  const created = await withRoomLock(String(room._id), async () => {
    const bookedUnits = await countOverlapping(String(room._id), checkIn, checkOut);

    if (bookedUnits >= room.totalUnits) {
      throw new HttpError(
        ErrorCode.ROOM_UNAVAILABLE,
        'Cette chambre n’est plus disponible sur ces dates',
        409,
      );
    }

    return Booking.create({
      reference: generateReference(),
      userId,
      hotelId: room.hotelId,
      roomId: room._id,
      checkIn,
      checkOut,
      nights,
      guests: input.guests,
      unitPrice: room.pricePerNight,
      totalPrice: room.pricePerNight * nights,
      currency: room.currency,
      status: BookingStatus.PENDING,
    });
  });

  // L'administration doit voir arriver la demande sans surveiller la liste.
  void notifyAdmins(
    'Nouvelle demande de réservation',
    `${created.reference} — ${hotel.name}, ${nights} nuit(s)`,
    { bookingId: String(created._id) },
  );

  return serializeDocument<BookingDto>(created.toObject());
}

/** Libellés partagés par les notifications de réservation. */
async function describeBooking(booking: {
  hotelId: unknown;
  userId: unknown;
  checkIn: Date;
  checkOut: Date;
}): Promise<{ email: string; hotelName: string; when: string }> {
  const [hotel, user] = await Promise.all([
    Hotel.findById(booking.hotelId).select('name').lean(),
    User.findById(booking.userId).select('email').lean(),
  ]);

  const format = (date: Date) => date.toISOString().slice(0, 10);

  return {
    email: user?.email ?? '',
    hotelName: hotel?.name ?? 'Établissement',
    when: `${format(booking.checkIn)} → ${format(booking.checkOut)}`,
  };
}

/**
 * Joint les noms d'hôtel et de chambre à un lot de réservations.
 *
 * Deux requêtes pour toute la page, quel que soit le nombre de lignes : les
 * identifiants sont rassemblés puis interrogés en une fois. Résoudre chaque
 * réservation séparément produirait le schéma « N+1 » — cinquante réservations
 * feraient cent-une requêtes, et la lenteur ne se verrait qu'en production, sur
 * les comptes les plus fournis.
 *
 * Le `Map` est indispensable : sans lui, retrouver le nom d'un hôtel pour
 * chaque réservation imposerait de parcourir la liste des hôtels à chaque fois.
 */
async function attachNames(bookings: BookingDto[]): Promise<BookingDto[]> {
  if (bookings.length === 0) return bookings;

  const hotelIds = [...new Set(bookings.map((booking) => String(booking.hotelId)))];
  const roomIds = [...new Set(bookings.map((booking) => String(booking.roomId)))];

  const [hotels, rooms] = await Promise.all([
    // Projection réduite au nom : rapatrier les fiches entières transporterait
    // descriptions et images pour n'en afficher qu'un titre.
    Hotel.find({ _id: { $in: hotelIds } }, { name: 1 }).lean(),
    Room.find({ _id: { $in: roomIds } }, { name: 1 }).lean(),
  ]);

  const hotelNames = new Map(hotels.map((hotel) => [String(hotel._id), hotel.name]));
  const roomNames = new Map(rooms.map((room) => [String(room._id), room.name]));

  return bookings.map((booking) => ({
    ...booking,
    /*
     * `?? undefined` et non une valeur de repli comme « Établissement » : un
     * nom générique laisserait croire que la donnée existe. L'absence remonte
     * telle quelle, et l'affichage retombe alors sur la référence.
     */
    hotelName: hotelNames.get(String(booking.hotelId)) ?? undefined,
    roomName: roomNames.get(String(booking.roomId)) ?? undefined,
  }));
}

export async function listBookings(
  query: BookingListQuery,
  actor: { userId: string; role: UserRole },
): Promise<PaginatedResult<BookingDto>> {
  const filter: Record<string, unknown> = {};

  // Un utilisateur ne voit que ses propres réservations, quel que soit le
  // paramètre `userId` qu'il envoie.
  if (actor.role === UserRole.ADMIN) {
    if (query.userId) filter.userId = query.userId;
  } else {
    filter.userId = actor.userId;
  }

  if (query.status) filter.status = query.status;

  // La recherche par référence n'a de sens que pour l'administration, qui prend
  // une référence au téléphone. Un utilisateur ne voit de toute façon que ses
  // propres réservations.
  if (query.search && actor.role === UserRole.ADMIN) {
    filter.reference = { $regex: escapeRegex(query.search), $options: 'i' };
  }

  const page = await paginateQuery(
    Booking,
    filter,
    { page: query.page, limit: query.limit, sort: { createdAt: -1 } },
    (doc) => serializeDocument<BookingDto>(doc),
  );

  return { ...page, items: await attachNames(page.items) };
}

export async function getBookingById(
  id: string,
  actor: { userId: string; role: UserRole },
): Promise<BookingDto> {
  const booking = await Booking.findById(id).lean();
  if (!booking) throw HttpError.notFound('Réservation introuvable');

  // Contrôle de propriété : un utilisateur authentifié ne doit pas pouvoir lire
  // la réservation d'un autre en changeant l'identifiant dans l'URL.
  if (actor.role !== UserRole.ADMIN && String(booking.userId) !== actor.userId) {
    // 404 plutôt que 403 : répondre « interdit » confirmerait l'existence de la
    // ressource et permettrait d'énumérer les réservations.
    throw HttpError.notFound('Réservation introuvable');
  }

  const [withNames] = await attachNames([serializeDocument<BookingDto>(booking)]);
  return withNames!;
}

export async function cancelBooking(
  id: string,
  actor: { userId: string; role: UserRole },
  reason?: string,
): Promise<BookingDto> {
  const booking = await Booking.findById(id).lean();
  if (!booking) throw HttpError.notFound('Réservation introuvable');

  if (actor.role !== UserRole.ADMIN && String(booking.userId) !== actor.userId) {
    throw HttpError.notFound('Réservation introuvable');
  }

  if (booking.status === BookingStatus.CANCELLED) {
    throw HttpError.conflict('Cette réservation est déjà annulée');
  }

  if (booking.status === BookingStatus.COMPLETED) {
    throw HttpError.conflict('Un séjour terminé ne peut pas être annulé');
  }

  /*
   * `findOneAndUpdate` conditionné au statut courant plutôt qu'un
   * lire-puis-écrire : deux annulations simultanées ne peuvent pas toutes deux
   * réussir, et la seconde repartira sur un document déjà annulé.
   */
  const updated = await Booking.findOneAndUpdate(
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

  if (!updated) throw HttpError.conflict('Cette réservation ne peut plus être annulée');

  const description = await describeBooking(updated);

  // Le statut vient de changer : les écrans ouverts sur cette réservation
  // doivent le refléter sans que l'utilisateur ait à tirer pour rafraîchir.
  void publish(
    SOCKET_EVENTS.BOOKING_UPDATED,
    { kind: 'user', userId: String(updated.userId) },
    { bookingId: String(updated._id), status: updated.status },
  );

  void notify({
    userId: String(updated.userId),
    type: NotificationType.BOOKING_CANCELLED,
    title: 'Réservation annulée',
    body: `${updated.reference} — ${description.hotelName}`,
    data: { bookingId: String(updated._id) },
    ...(description.email
      ? {
          email: bookingCancelledEmail(description.email, {
            reference: updated.reference,
            placeName: description.hotelName,
            ...(reason ? { reason } : {}),
          }),
        }
      : {}),
  });

  return serializeDocument<BookingDto>(updated);
}

/** Confirmation par un administrateur depuis le dashboard (Phase 8 pour l'écran). */
export async function confirmBooking(id: string): Promise<BookingDto> {
  const updated = await Booking.findOneAndUpdate(
    { _id: id, status: BookingStatus.PENDING },
    { $set: { status: BookingStatus.CONFIRMED } },
    { new: true },
  ).lean();

  if (!updated) throw HttpError.conflict('Seule une réservation en attente peut être confirmée');

  const description = await describeBooking(updated);

  void publish(
    SOCKET_EVENTS.BOOKING_UPDATED,
    { kind: 'user', userId: String(updated.userId) },
    { bookingId: String(updated._id), status: updated.status },
  );

  void notify({
    userId: String(updated.userId),
    type: NotificationType.BOOKING_CONFIRMED,
    title: 'Réservation confirmée',
    body: `${updated.reference} — ${description.hotelName}, ${description.when}`,
    data: { bookingId: String(updated._id) },
    ...(description.email
      ? {
          email: bookingConfirmedEmail(description.email, {
            reference: updated.reference,
            placeName: description.hotelName,
            when: description.when,
            total: `${updated.totalPrice} ${updated.currency}`,
          }),
        }
      : {}),
  });

  return serializeDocument<BookingDto>(updated);
}
