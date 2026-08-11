import { randomBytes } from 'node:crypto';

import { BookingStatus, ContentStatus, ErrorCode, UserRole } from '@tourism/shared/constants';
import type { Booking as BookingDto } from '@tourism/shared/types';
import {
  countNights,
  startOfUtcDay,
  type BookingListQuery,
  type CreateBookingInput,
} from '@tourism/shared/validation';

import { HttpError } from '@/lib/errors';
import { paginateQuery, type PaginatedResult } from '@/lib/query';
import { serializeDocument } from '@/lib/serialize';
import { Booking, Hotel, Room } from '@/models';

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

  const bookedUnits = await countOverlapping(String(room._id), checkIn, checkOut);
  if (bookedUnits >= room.totalUnits) {
    throw new HttpError(
      ErrorCode.ROOM_UNAVAILABLE,
      'Cette chambre n’est plus disponible sur ces dates',
      409,
    );
  }

  const nights = countNights(checkIn, checkOut);

  const created = await Booking.create({
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

  /*
   * Limite connue, à lever en Phase 8.
   *
   * Entre le comptage ci-dessus et cette insertion, deux requêtes simultanées
   * peuvent toutes deux voir la dernière unité comme libre et réserver la même.
   * La fenêtre est de quelques millisecondes et le nombre d'unités est
   * généralement supérieur à un, ce qui rend l'occurrence rare — mais elle
   * existe.
   *
   * La correction demande une transaction multi-documents, donc un replica set
   * (MongoDB Atlas en fournit un ; une instance locale par défaut, non). Elle
   * est planifiée en Phase 8 avec le verrouillage temporaire de stock.
   */

  return serializeDocument<BookingDto>(created.toObject());
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

  return paginateQuery(
    Booking,
    filter,
    { page: query.page, limit: query.limit, sort: { createdAt: -1 } },
    (doc) => serializeDocument<BookingDto>(doc),
  );
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

  return serializeDocument<BookingDto>(booking);
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
  return serializeDocument<BookingDto>(updated);
}
