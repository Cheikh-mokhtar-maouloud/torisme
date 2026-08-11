import Link from 'next/link';

import { BookingStatus } from '@tourism/shared/constants';
import type { ExcursionBooking, User } from '@tourism/shared/types';

import { Badge, Card, EmptyState } from '@/components/ui/primitives';
import { api } from '@/lib/api/client';
import { formatDate, formatMoney } from '@/lib/format';

const STATUS: Record<
  string,
  { label: string; tone: 'neutral' | 'success' | 'warning' | 'danger' }
> = {
  [BookingStatus.PENDING]: { label: 'En attente', tone: 'warning' },
  [BookingStatus.CONFIRMED]: { label: 'Confirmée', tone: 'success' },
  [BookingStatus.CANCELLED]: { label: 'Annulée', tone: 'danger' },
  [BookingStatus.COMPLETED]: { label: 'Terminée', tone: 'neutral' },
};

/**
 * Participants d'une excursion.
 *
 * Les réservations annulées restent affichées, en retrait : l'organisateur a
 * besoin de savoir qu'un client s'est désisté, pas seulement qui vient.
 */
export async function ExcursionParticipants({ excursionId }: { excursionId: string }) {
  const { items } = await api.list<ExcursionBooking>(
    `/api/excursion-bookings?excursionId=${excursionId}&limit=100`,
  );

  // Les comptes sont chargés en parallèle ; un compte supprimé ne doit pas
  // empêcher l'affichage de la liste.
  const customers = await Promise.all(
    items.map((booking) => api.get<User>(`/api/users/${booking.userId}`).catch(() => undefined)),
  );

  const active = items.filter((booking) => booking.status !== BookingStatus.CANCELLED);
  const seatsTaken = active.reduce((total, booking) => total + booking.seats, 0);

  return (
    <section className="mt-8">
      <h2 className="mb-3 text-sm font-semibold text-slate-900">
        Participants{' '}
        <span className="font-normal text-slate-500">
          ({seatsTaken} place{seatsTaken > 1 ? 's' : ''} sur {active.length} réservation
          {active.length > 1 ? 's' : ''})
        </span>
      </h2>

      <Card>
        {items.length === 0 ? (
          <EmptyState
            title="Aucune réservation"
            description="Les demandes envoyées depuis l’application apparaîtront ici."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((booking, index) => {
              const customer = customers[index];
              const status = STATUS[booking.status] ?? {
                label: booking.status,
                tone: 'neutral' as const,
              };
              const isCancelled = booking.status === BookingStatus.CANCELLED;

              return (
                <li
                  key={booking.id}
                  className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 ${
                    isCancelled ? 'opacity-60' : ''
                  }`}
                >
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-medium text-slate-900">
                      {booking.reference}
                    </p>
                    <p className="text-xs text-slate-500">
                      {customer ? (
                        <Link href={`/users/${customer.id}`} className="hover:underline">
                          {customer.fullName}
                        </Link>
                      ) : (
                        'Compte supprimé'
                      )}
                      {' · '}
                      {formatDate(booking.createdAt)}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-sm text-slate-700">
                      {booking.seats} place{booking.seats > 1 ? 's' : ''}
                    </span>
                    <span className="text-sm font-medium text-slate-900">
                      {formatMoney(booking.totalPrice, booking.currency)}
                    </span>
                    <Badge tone={status.tone}>{status.label}</Badge>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </section>
  );
}
