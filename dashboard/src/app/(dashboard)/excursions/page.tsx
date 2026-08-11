import type { Metadata } from 'next';
import Link from 'next/link';

import { ExcursionStatus } from '@tourism/shared/constants';
import type { Excursion } from '@tourism/shared/types';

import { DataTable, type Column } from '@/components/data/data-table';
import { FilterBar } from '@/components/data/filter-bar';
import { Pagination } from '@/components/data/pagination';
import { ButtonLink } from '@/components/ui/button';
import { Badge, Card, EmptyState, PageHeader, StatusBadge } from '@/components/ui/primitives';
import { api, toSearchParams } from '@/lib/api/client';
import { formatDateTime, formatMoney } from '@/lib/format';

export const metadata: Metadata = { title: 'Excursions — Administration' };

interface SearchParams {
  page?: string;
  search?: string;
  excursionStatus?: string;
  includePast?: string;
}

export default async function ExcursionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  // Le dashboard affiche l'historique par défaut : un administrateur a besoin de
  // consulter les excursions passées, contrairement à l'application mobile.
  const query = toSearchParams({
    page: params.page ?? '1',
    limit: 20,
    search: params.search,
    excursionStatus: params.excursionStatus,
    includePast: params.includePast ?? 'true',
  });

  const { items, meta } = await api.list<Excursion>(`/api/excursions${query}`);

  return (
    <>
      <PageHeader
        title="Excursions"
        description="Sorties programmées, avec places disponibles."
        actions={<ButtonLink href="/excursions/new">Nouvelle excursion</ButtonLink>}
      />

      <Card>
        <FilterBar
          basePath="/excursions"
          search={params.search}
          searchPlaceholder="Titre ou destination…"
          filters={[
            {
              name: 'excursionStatus',
              label: 'Statut',
              value: params.excursionStatus,
              options: [
                { value: ExcursionStatus.SCHEDULED, label: 'Programmée' },
                { value: ExcursionStatus.FULL, label: 'Complète' },
                { value: ExcursionStatus.CANCELLED, label: 'Annulée' },
                { value: ExcursionStatus.COMPLETED, label: 'Terminée' },
              ],
            },
            {
              name: 'includePast',
              label: 'Période',
              value: params.includePast,
              options: [
                { value: 'true', label: 'Toutes' },
                { value: 'false', label: 'À venir uniquement' },
              ],
            },
          ]}
        />

        <DataTable
          columns={COLUMNS}
          rows={items}
          empty={
            <EmptyState
              title="Aucune excursion"
              description="Programmez une sortie pour la rendre réservable."
              action={<ButtonLink href="/excursions/new">Nouvelle excursion</ButtonLink>}
            />
          }
        />

        <Pagination
          meta={meta}
          basePath="/excursions"
          params={{
            search: params.search,
            excursionStatus: params.excursionStatus,
            includePast: params.includePast,
          }}
        />
      </Card>
    </>
  );
}

const COLUMNS: Column<Excursion>[] = [
  {
    key: 'title',
    header: 'Excursion',
    cell: (excursion) => (
      <div>
        <Link
          href={`/excursions/${excursion.id}`}
          className="font-medium text-slate-900 hover:underline"
        >
          {excursion.title}
        </Link>
        <p className="text-xs text-slate-500">{excursion.destination}</p>
      </div>
    ),
  },
  {
    key: 'startsAt',
    header: 'Départ',
    hideOnMobile: true,
    cell: (excursion) => formatDateTime(excursion.startsAt),
  },
  {
    key: 'seats',
    header: 'Places',
    cell: (excursion) => <SeatsIndicator excursion={excursion} />,
  },
  {
    key: 'price',
    header: 'Prix',
    hideOnMobile: true,
    cell: (excursion) => formatMoney(excursion.price, excursion.currency),
  },
  {
    key: 'status',
    header: 'Statut',
    cell: (excursion) => <StatusBadge status={excursion.status} />,
  },
  {
    key: 'actions',
    header: 'Actions',
    align: 'right',
    cell: (excursion) => (
      <Link href={`/excursions/${excursion.id}`} className="text-sm text-brand-700 hover:underline">
        Détails
      </Link>
    ),
  },
];

/** Met en évidence les excursions complètes ou presque : c'est l'information qui appelle une action. */
function SeatsIndicator({ excursion }: { excursion: Excursion }) {
  const { availableSeats, totalSeats } = excursion;
  const tone =
    availableSeats === 0 ? 'danger' : availableSeats <= totalSeats * 0.2 ? 'warning' : 'neutral';

  return (
    <Badge tone={tone}>
      {availableSeats} / {totalSeats}
    </Badge>
  );
}
