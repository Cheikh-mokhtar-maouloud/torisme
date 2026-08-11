import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import type { Booking, Hotel, Room, User } from '@tourism/shared/types';

import { ButtonLink } from '@/components/ui/button';
import { Badge, Card, PageHeader } from '@/components/ui/primitives';
import { api, ApiRequestError } from '@/lib/api/client';
import { formatDate, formatDateTime, formatMoney } from '@/lib/format';

import { BookingActions } from '../booking-actions';
import { BOOKING_STATUS } from '../page';

type PageProps = { params: Promise<{ id: string }> };

export const metadata: Metadata = { title: 'Réservation — Administration' };

export default async function BookingDetailPage({ params }: PageProps) {
  const { id } = await params;
  const booking = await loadBooking(id);

  /*
   * Les entités liées sont chargées en parallèle et de façon tolérante : une
   * chambre supprimée depuis la réservation ne doit pas rendre la fiche
   * inaccessible — c'est justement le moment où l'administrateur a besoin de la
   * consulter.
   */
  const [hotel, room, customer] = await Promise.all([
    safeGet<Hotel>(`/api/hotels/${booking.hotelId}`),
    safeGet<Room>(`/api/rooms/${booking.roomId}`),
    safeGet<User>(`/api/users/${booking.userId}`),
  ]);

  const status = BOOKING_STATUS[booking.status] ?? {
    label: booking.status,
    tone: 'neutral' as const,
  };

  return (
    <>
      <PageHeader
        title={booking.reference}
        description={`Demandée le ${formatDateTime(booking.createdAt)}`}
        actions={
          <ButtonLink href="/bookings" variant="ghost">
            ← Liste
          </ButtonLink>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card className="p-5">
            <div className="mb-4 flex items-center gap-3">
              <Badge tone={status.tone}>{status.label}</Badge>
              {booking.cancelledAt && (
                <span className="text-xs text-slate-500">
                  Annulée le {formatDate(booking.cancelledAt)}
                </span>
              )}
            </div>

            <dl className="divide-y divide-slate-100 text-sm">
              <Row label="Arrivée" value={formatDate(booking.checkIn)} />
              <Row label="Départ" value={formatDate(booking.checkOut)} />
              <Row label="Durée" value={`${booking.nights} nuit(s)`} />
              <Row label="Voyageurs" value={String(booking.guests)} />
            </dl>

            {booking.cancellationReason && (
              <p className="mt-4 rounded-md bg-slate-50 p-3 text-sm text-slate-600">
                <span className="font-medium">Motif : </span>
                {booking.cancellationReason}
              </p>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Actions</h2>
            <BookingActions booking={booking} />
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Montant</h2>
            <dl className="divide-y divide-slate-100 text-sm">
              <Row
                label={`${formatMoney(booking.unitPrice, booking.currency)} × ${booking.nights}`}
                value={formatMoney(booking.unitPrice * booking.nights, booking.currency)}
              />
              <Row
                label="Total"
                value={formatMoney(booking.totalPrice, booking.currency)}
                emphasis
              />
            </dl>
            <p className="mt-3 text-xs text-slate-500">
              Prix figé à la réservation : un changement de tarif ne modifie pas les séjours déjà
              demandés.
            </p>
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Client</h2>
            {customer ? (
              <dl className="divide-y divide-slate-100 text-sm">
                <Row label="Nom" value={customer.fullName} />
                <Row label="Email" value={customer.email} />
                {customer.phone && <Row label="Téléphone" value={customer.phone} />}
              </dl>
            ) : (
              <p className="text-sm text-slate-500">Compte introuvable.</p>
            )}
            {customer && (
              <Link
                href={`/users/${customer.id}`}
                className="mt-3 inline-block text-sm text-brand-700 hover:underline"
              >
                Voir le compte →
              </Link>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Hébergement</h2>
            <dl className="divide-y divide-slate-100 text-sm">
              <Row label="Hôtel" value={hotel?.name ?? 'Supprimé'} />
              <Row label="Chambre" value={room?.name ?? 'Supprimée'} />
            </dl>
            {hotel && (
              <Link
                href={`/hotels/${hotel.id}`}
                className="mt-3 inline-block text-sm text-brand-700 hover:underline"
              >
                Voir l’hôtel →
              </Link>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

async function loadBooking(id: string): Promise<Booking> {
  try {
    return await api.get<Booking>(`/api/bookings/${id}`);
  } catch (error) {
    if (error instanceof ApiRequestError && (error.status === 404 || error.status === 422)) {
      notFound();
    }
    throw error;
  }
}

/** Lecture tolérante : `undefined` plutôt qu'une erreur si la ressource a disparu. */
async function safeGet<T>(path: string): Promise<T | undefined> {
  try {
    return await api.get<T>(path);
  } catch {
    return undefined;
  }
}

function Row({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <dt className={emphasis ? 'font-semibold text-slate-900' : 'text-slate-500'}>{label}</dt>
      <dd
        className={
          emphasis
            ? 'text-right font-semibold text-slate-900'
            : 'truncate text-right font-medium text-slate-900'
        }
      >
        {value}
      </dd>
    </div>
  );
}
