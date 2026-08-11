import type { Metadata } from 'next';
import Link from 'next/link';

import { ContentStatus } from '@tourism/shared/constants';
import type { Hotel } from '@tourism/shared/types';

import { DataTable, type Column } from '@/components/data/data-table';
import { FilterBar } from '@/components/data/filter-bar';
import { Pagination } from '@/components/data/pagination';
import { ButtonLink } from '@/components/ui/button';
import { Card, EmptyState, PageHeader, StatusBadge } from '@/components/ui/primitives';
import { api, toSearchParams } from '@/lib/api/client';
import { formatMoney } from '@/lib/format';

export const metadata: Metadata = { title: 'Hôtels — Administration' };

interface SearchParams {
  page?: string;
  search?: string;
  status?: string;
  city?: string;
}

export default async function HotelsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  // Le dashboard interroge l'API avec un jeton admin : la liste inclut donc
  // brouillons et archives, contrairement à la même route vue par le mobile.
  const query = toSearchParams({
    page: params.page ?? '1',
    limit: 20,
    search: params.search,
    status: params.status,
    city: params.city,
  });

  const { items, meta } = await api.list<Hotel>(`/api/hotels${query}`);

  return (
    <>
      <PageHeader
        title="Hôtels"
        description="Établissements proposés à la réservation."
        actions={<ButtonLink href="/hotels/new">Nouvel hôtel</ButtonLink>}
      />

      <Card>
        <FilterBar
          basePath="/hotels"
          search={params.search}
          searchPlaceholder="Nom ou description…"
          filters={[
            {
              name: 'status',
              label: 'Statut',
              value: params.status,
              options: [
                { value: ContentStatus.PUBLISHED, label: 'Publié' },
                { value: ContentStatus.DRAFT, label: 'Brouillon' },
                { value: ContentStatus.ARCHIVED, label: 'Archivé' },
              ],
            },
          ]}
        />

        <DataTable
          columns={COLUMNS}
          rows={items}
          empty={
            <EmptyState
              title="Aucun hôtel"
              description={
                params.search || params.status
                  ? 'Aucun résultat pour ces critères. Essayez de les élargir.'
                  : 'Créez votre premier établissement pour le rendre visible dans l’application.'
              }
              action={<ButtonLink href="/hotels/new">Nouvel hôtel</ButtonLink>}
            />
          }
        />

        <Pagination
          meta={meta}
          basePath="/hotels"
          params={{ search: params.search, status: params.status, city: params.city }}
        />
      </Card>
    </>
  );
}

const COLUMNS: Column<Hotel>[] = [
  {
    key: 'name',
    header: 'Nom',
    cell: (hotel) => (
      <div>
        <Link href={`/hotels/${hotel.id}`} className="font-medium text-slate-900 hover:underline">
          {hotel.name}
        </Link>
        <p className="text-xs text-slate-500">
          {hotel.address.city}
          {hotel.stars ? ` · ${hotel.stars} étoiles` : ''}
        </p>
      </div>
    ),
  },
  {
    key: 'price',
    header: 'À partir de',
    hideOnMobile: true,
    cell: (hotel) => formatMoney(hotel.minPricePerNight, hotel.currency),
  },
  {
    key: 'rating',
    header: 'Note',
    hideOnMobile: true,
    cell: (hotel) =>
      hotel.reviewCount > 0 ? (
        <span>
          {hotel.rating.toFixed(1)}{' '}
          <span className="text-xs text-slate-400">({hotel.reviewCount})</span>
        </span>
      ) : (
        <span className="text-slate-400">—</span>
      ),
  },
  {
    key: 'status',
    header: 'Statut',
    cell: (hotel) => <StatusBadge status={hotel.status} />,
  },
  {
    key: 'actions',
    header: 'Actions',
    align: 'right',
    cell: (hotel) => (
      <Link href={`/hotels/${hotel.id}`} className="text-sm text-brand-700 hover:underline">
        Détails
      </Link>
    ),
  },
];
