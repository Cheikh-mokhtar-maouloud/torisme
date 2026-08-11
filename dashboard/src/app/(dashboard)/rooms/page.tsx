import type { Metadata } from 'next';
import Link from 'next/link';

import type { Room } from '@tourism/shared/types';

import { DataTable, type Column } from '@/components/data/data-table';
import { FilterBar } from '@/components/data/filter-bar';
import { Pagination } from '@/components/data/pagination';
import { ButtonLink } from '@/components/ui/button';
import { Card, EmptyState, PageHeader, StatusBadge } from '@/components/ui/primitives';
import { api, toSearchParams } from '@/lib/api/client';
import { CONTENT_STATUS_OPTIONS, loadHotelOptions } from '@/lib/api/resources';
import { formatMoney } from '@/lib/format';

export const metadata: Metadata = { title: 'Chambres — Administration' };

interface SearchParams {
  page?: string;
  search?: string;
  status?: string;
  hotelId?: string;
}

export default async function RoomsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;

  const query = toSearchParams({
    page: params.page ?? '1',
    limit: 20,
    search: params.search,
    status: params.status,
    hotelId: params.hotelId,
  });

  // Les deux lectures sont indépendantes : les enchaîner doublerait la latence.
  const [{ items, meta }, hotels] = await Promise.all([
    api.list<Room>(`/api/rooms${query}`),
    loadHotelOptions(),
  ]);

  const hotelNames = new Map(hotels.map((hotel) => [hotel.id, hotel.name]));

  return (
    <>
      <PageHeader
        title="Chambres"
        description="Types de chambres proposés par les hôtels."
        actions={<ButtonLink href="/rooms/new">Nouvelle chambre</ButtonLink>}
      />

      <Card>
        <FilterBar
          basePath="/rooms"
          search={params.search}
          searchPlaceholder="Nom de chambre…"
          filters={[
            {
              name: 'hotelId',
              label: 'Hôtel',
              value: params.hotelId,
              options: hotels.map((hotel) => ({ value: hotel.id, label: hotel.name })),
            },
            {
              name: 'status',
              label: 'Statut',
              value: params.status,
              options: CONTENT_STATUS_OPTIONS,
            },
          ]}
        />

        <DataTable
          columns={buildColumns(hotelNames)}
          rows={items}
          empty={
            <EmptyState
              title="Aucune chambre"
              description="Une chambre publiée rend son hôtel réservable."
              action={<ButtonLink href="/rooms/new">Nouvelle chambre</ButtonLink>}
            />
          }
        />

        <Pagination
          meta={meta}
          basePath="/rooms"
          params={{ search: params.search, status: params.status, hotelId: params.hotelId }}
        />
      </Card>
    </>
  );
}

function buildColumns(hotelNames: Map<string, string>): Column<Room>[] {
  return [
    {
      key: 'name',
      header: 'Chambre',
      cell: (room) => (
        <div>
          <Link href={`/rooms/${room.id}`} className="font-medium text-slate-900 hover:underline">
            {room.name}
          </Link>
          <p className="text-xs text-slate-500">
            {hotelNames.get(room.hotelId) ?? 'Hôtel inconnu'}
          </p>
        </div>
      ),
    },
    {
      key: 'capacity',
      header: 'Capacité',
      hideOnMobile: true,
      cell: (room) => `${room.capacity} pers. · ${room.bedCount} lit(s)`,
    },
    {
      key: 'units',
      header: 'Unités',
      hideOnMobile: true,
      cell: (room) => room.totalUnits,
    },
    {
      key: 'price',
      header: 'Prix / nuit',
      cell: (room) => formatMoney(room.pricePerNight, room.currency),
    },
    { key: 'status', header: 'Statut', cell: (room) => <StatusBadge status={room.status} /> },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      cell: (room) => (
        <Link href={`/rooms/${room.id}`} className="text-sm text-brand-700 hover:underline">
          Détails
        </Link>
      ),
    },
  ];
}
