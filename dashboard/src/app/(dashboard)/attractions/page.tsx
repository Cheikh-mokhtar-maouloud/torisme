import type { Metadata } from 'next';
import Link from 'next/link';

import type { Attraction } from '@tourism/shared/types';

import { DataTable, type Column } from '@/components/data/data-table';
import { FilterBar } from '@/components/data/filter-bar';
import { Pagination } from '@/components/data/pagination';
import { ButtonLink } from '@/components/ui/button';
import { Card, EmptyState, PageHeader, StatusBadge } from '@/components/ui/primitives';
import { api, toSearchParams } from '@/lib/api/client';
import { CONTENT_STATUS_OPTIONS } from '@/lib/api/resources';
import { formatMoney } from '@/lib/format';

export const metadata: Metadata = { title: 'Attractions — Administration' };

interface SearchParams {
  page?: string;
  search?: string;
  status?: string;
  freeOnly?: string;
}

export default async function AttractionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  const query = toSearchParams({
    page: params.page ?? '1',
    limit: 20,
    search: params.search,
    status: params.status,
    freeOnly: params.freeOnly,
  });

  const { items, meta } = await api.list<Attraction>(`/api/attractions${query}`);

  return (
    <>
      <PageHeader
        title="Attractions"
        description="Sites touristiques affichés sur la carte."
        actions={<ButtonLink href="/attractions/new">Nouvelle attraction</ButtonLink>}
      />

      <Card>
        <FilterBar
          basePath="/attractions"
          search={params.search}
          searchPlaceholder="Nom ou description…"
          filters={[
            {
              name: 'status',
              label: 'Statut',
              value: params.status,
              options: CONTENT_STATUS_OPTIONS,
            },
            {
              name: 'freeOnly',
              label: 'Tarif',
              value: params.freeOnly,
              options: [{ value: 'true', label: 'Gratuites uniquement' }],
            },
          ]}
        />

        <DataTable
          columns={COLUMNS}
          rows={items}
          empty={
            <EmptyState
              title="Aucune attraction"
              description="Les attractions alimentent l’onglet Explorer et la carte."
              action={<ButtonLink href="/attractions/new">Nouvelle attraction</ButtonLink>}
            />
          }
        />

        <Pagination
          meta={meta}
          basePath="/attractions"
          params={{ search: params.search, status: params.status, freeOnly: params.freeOnly }}
        />
      </Card>
    </>
  );
}

const COLUMNS: Column<Attraction>[] = [
  {
    key: 'name',
    header: 'Nom',
    cell: (attraction) => (
      <div>
        <Link
          href={`/attractions/${attraction.id}`}
          className="font-medium text-slate-900 hover:underline"
        >
          {attraction.name}
        </Link>
        <p className="text-xs text-slate-500">{attraction.address.city}</p>
      </div>
    ),
  },
  {
    key: 'fee',
    header: 'Entrée',
    hideOnMobile: true,
    cell: (attraction) =>
      attraction.entryFee
        ? formatMoney(attraction.entryFee, attraction.currency ?? 'MRU')
        : 'Gratuite',
  },
  {
    key: 'rating',
    header: 'Note',
    hideOnMobile: true,
    cell: (attraction) =>
      attraction.reviewCount > 0 ? (
        <span>
          {attraction.rating.toFixed(1)}{' '}
          <span className="text-xs text-slate-400">({attraction.reviewCount})</span>
        </span>
      ) : (
        <span className="text-slate-400">—</span>
      ),
  },
  {
    key: 'status',
    header: 'Statut',
    cell: (attraction) => <StatusBadge status={attraction.status} />,
  },
  {
    key: 'actions',
    header: 'Actions',
    align: 'right',
    cell: (attraction) => (
      <Link
        href={`/attractions/${attraction.id}`}
        className="text-sm text-brand-700 hover:underline"
      >
        Détails
      </Link>
    ),
  },
];
