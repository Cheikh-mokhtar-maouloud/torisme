import type { Metadata } from 'next';
import Link from 'next/link';

import { BookingStatus } from '@tourism/shared/constants';
import type { Booking } from '@tourism/shared/types';

import { DataTable, type Column } from '@/components/data/data-table';
import { FilterBar } from '@/components/data/filter-bar';
import { Pagination } from '@/components/data/pagination';
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui/primitives';
import { LiveUpdates } from '@/components/data/live-updates';
import { api, toSearchParams } from '@/lib/api/client';
import { config } from '@/lib/config';
import { getSessionToken } from '@/lib/auth/session';
import { formatDate, formatMoney } from '@/lib/format';

export const metadata: Metadata = { title: 'Réservations — Administration' };

/** Libellés et tons partagés par la liste et la fiche. */
export const BOOKING_STATUS: Record<
  string,
  { label: string; tone: 'neutral' | 'success' | 'warning' | 'danger' }
> = {
  [BookingStatus.PENDING]: { label: 'En attente', tone: 'warning' },
  [BookingStatus.CONFIRMED]: { label: 'Confirmée', tone: 'success' },
  [BookingStatus.CANCELLED]: { label: 'Annulée', tone: 'danger' },
  [BookingStatus.COMPLETED]: { label: 'Terminée', tone: 'neutral' },
};

interface SearchParams {
  page?: string;
  status?: string;
  search?: string;
}

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  const query = toSearchParams({
    page: params.page ?? '1',
    limit: 20,
    status: params.status,
    search: params.search,
  });

  // Le jeton administrateur donne accès à toutes les réservations, contrairement
  // au même endpoint appelé depuis l'application mobile.
  const { items, meta } = await api.list<Booking>(`/api/bookings${query}`);

  // Le jeton est transmis au composant client : le navigateur ne peut pas lire
  // le cookie de session, qui est HTTP-only.
  const token = (await getSessionToken()) ?? '';

  const pendingCount = items.filter((booking) => booking.status === BookingStatus.PENDING).length;

  return (
    <>
      <PageHeader
        title="Réservations"
        description={
          pendingCount > 0
            ? `${pendingCount} demande${pendingCount > 1 ? 's' : ''} en attente sur cette page.`
            : 'Demandes de séjour reçues depuis l’application.'
        }
        actions={<LiveUpdates token={token} realtimeUrl={config.realtimeUrl} />}
      />

      <Card>
        <FilterBar
          basePath="/bookings"
          search={params.search}
          searchPlaceholder="Référence (TP-…)"
          filters={[
            {
              name: 'status',
              label: 'Statut',
              value: params.status,
              options: [
                { value: BookingStatus.PENDING, label: 'En attente' },
                { value: BookingStatus.CONFIRMED, label: 'Confirmée' },
                { value: BookingStatus.CANCELLED, label: 'Annulée' },
                { value: BookingStatus.COMPLETED, label: 'Terminée' },
              ],
            },
          ]}
        />

        <DataTable
          columns={COLUMNS}
          rows={items}
          empty={
            <EmptyState
              title="Aucune réservation"
              description={
                params.search || params.status
                  ? 'Aucun résultat pour ces critères.'
                  : 'Les demandes envoyées depuis l’application apparaîtront ici.'
              }
            />
          }
        />

        <Pagination
          meta={meta}
          basePath="/bookings"
          params={{ status: params.status, search: params.search }}
        />
      </Card>
    </>
  );
}

const COLUMNS: Column<Booking>[] = [
  {
    key: 'reference',
    header: 'Référence',
    cell: (booking) => (
      <div>
        <Link
          href={`/bookings/${booking.id}`}
          className="font-mono font-medium text-slate-900 hover:underline"
        >
          {booking.reference}
        </Link>
        <p className="text-xs text-slate-500">Demandée le {formatDate(booking.createdAt)}</p>
      </div>
    ),
  },
  {
    key: 'dates',
    header: 'Séjour',
    hideOnMobile: true,
    cell: (booking) => (
      <span>
        {formatDate(booking.checkIn)} → {formatDate(booking.checkOut)}
        <span className="text-slate-400"> · {booking.nights} nuit(s)</span>
      </span>
    ),
  },
  {
    key: 'guests',
    header: 'Voyageurs',
    hideOnMobile: true,
    cell: (booking) => booking.guests,
  },
  {
    key: 'total',
    header: 'Total',
    cell: (booking) => formatMoney(booking.totalPrice, booking.currency),
  },
  {
    key: 'status',
    header: 'Statut',
    cell: (booking) => {
      const status = BOOKING_STATUS[booking.status] ?? {
        label: booking.status,
        tone: 'neutral' as const,
      };
      return <Badge tone={status.tone}>{status.label}</Badge>;
    },
  },
  {
    key: 'actions',
    header: 'Actions',
    align: 'right',
    cell: (booking) => (
      <Link href={`/bookings/${booking.id}`} className="text-sm text-brand-700 hover:underline">
        Détails
      </Link>
    ),
  },
];
