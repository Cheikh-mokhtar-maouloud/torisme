import type { Metadata } from 'next';
import Link from 'next/link';

import type { Restaurant } from '@tourism/shared/types';

import { DataTable, type Column } from '@/components/data/data-table';
import { FilterBar } from '@/components/data/filter-bar';
import { Pagination } from '@/components/data/pagination';
import { ButtonLink } from '@/components/ui/button';
import { Card, EmptyState, PageHeader, StatusBadge } from '@/components/ui/primitives';
import { api, toSearchParams } from '@/lib/api/client';
import { CONTENT_STATUS_OPTIONS } from '@/lib/api/resources';

export const metadata: Metadata = { title: 'Restaurants — Administration' };

interface SearchParams {
  page?: string;
  search?: string;
  status?: string;
  maxPriceRange?: string;
}

export default async function RestaurantsPage({
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
    maxPriceRange: params.maxPriceRange,
  });

  const { items, meta } = await api.list<Restaurant>(`/api/restaurants${query}`);

  return (
    <>
      <PageHeader
        title="Restaurants"
        description="Établissements affichés sur la carte et dans l’onglet Explorer."
        actions={<ButtonLink href="/restaurants/new">Nouveau restaurant</ButtonLink>}
      />

      <Card>
        <FilterBar
          basePath="/restaurants"
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
              name: 'maxPriceRange',
              label: 'Prix max',
              value: params.maxPriceRange,
              options: [
                { value: '1', label: '€' },
                { value: '2', label: '€€' },
                { value: '3', label: '€€€' },
                { value: '4', label: '€€€€' },
              ],
            },
          ]}
        />

        <DataTable
          columns={COLUMNS}
          rows={items}
          empty={
            <EmptyState
              title="Aucun restaurant"
              description="Ajoutez des restaurants pour enrichir la carte touristique."
              action={<ButtonLink href="/restaurants/new">Nouveau restaurant</ButtonLink>}
            />
          }
        />

        <Pagination
          meta={meta}
          basePath="/restaurants"
          params={{
            search: params.search,
            status: params.status,
            maxPriceRange: params.maxPriceRange,
          }}
        />
      </Card>
    </>
  );
}

const COLUMNS: Column<Restaurant>[] = [
  {
    key: 'name',
    header: 'Nom',
    cell: (restaurant) => (
      <div>
        <Link
          href={`/restaurants/${restaurant.id}`}
          className="font-medium text-slate-900 hover:underline"
        >
          {restaurant.name}
        </Link>
        <p className="text-xs text-slate-500">{restaurant.address.city}</p>
      </div>
    ),
  },
  {
    key: 'cuisine',
    header: 'Cuisine',
    hideOnMobile: true,
    cell: (restaurant) =>
      restaurant.cuisineTypes.length > 0 ? (
        restaurant.cuisineTypes.join(', ')
      ) : (
        <span className="text-slate-400">—</span>
      ),
  },
  {
    key: 'price',
    header: 'Gamme',
    hideOnMobile: true,
    cell: (restaurant) => '€'.repeat(restaurant.priceRange),
  },
  {
    key: 'status',
    header: 'Statut',
    cell: (restaurant) => <StatusBadge status={restaurant.status} />,
  },
  {
    key: 'actions',
    header: 'Actions',
    align: 'right',
    cell: (restaurant) => (
      <Link
        href={`/restaurants/${restaurant.id}`}
        className="text-sm text-brand-700 hover:underline"
      >
        Détails
      </Link>
    ),
  },
];
