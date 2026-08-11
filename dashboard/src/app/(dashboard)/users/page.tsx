import type { Metadata } from 'next';
import Link from 'next/link';

import { UserRole } from '@tourism/shared/constants';
import type { User } from '@tourism/shared/types';

import { DataTable, type Column } from '@/components/data/data-table';
import { FilterBar } from '@/components/data/filter-bar';
import { Pagination } from '@/components/data/pagination';
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui/primitives';
import { api, toSearchParams } from '@/lib/api/client';
import { formatDate } from '@/lib/format';

export const metadata: Metadata = { title: 'Utilisateurs — Administration' };

interface SearchParams {
  page?: string;
  search?: string;
  role?: string;
  isActive?: string;
}

export default async function UsersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;

  const query = toSearchParams({
    page: params.page ?? '1',
    limit: 20,
    search: params.search,
    role: params.role,
    isActive: params.isActive,
  });

  const { items, meta } = await api.list<User>(`/api/users${query}`);

  return (
    <>
      <PageHeader
        title="Utilisateurs"
        description="Comptes touristes et administrateurs. Les comptes se créent par inscription."
      />

      <Card>
        <FilterBar
          basePath="/users"
          search={params.search}
          searchPlaceholder="Nom ou email…"
          filters={[
            {
              name: 'role',
              label: 'Rôle',
              value: params.role,
              options: [
                { value: UserRole.ADMIN, label: 'Administrateur' },
                { value: UserRole.USER, label: 'Touriste' },
              ],
            },
            {
              name: 'isActive',
              label: 'État',
              value: params.isActive,
              options: [
                { value: 'true', label: 'Actifs' },
                { value: 'false', label: 'Désactivés' },
              ],
            },
          ]}
        />

        <DataTable
          columns={COLUMNS}
          rows={items}
          empty={
            <EmptyState
              title="Aucun utilisateur"
              description="Aucun compte ne correspond à ces critères."
            />
          }
        />

        <Pagination
          meta={meta}
          basePath="/users"
          params={{ search: params.search, role: params.role, isActive: params.isActive }}
        />
      </Card>
    </>
  );
}

const COLUMNS: Column<User>[] = [
  {
    key: 'name',
    header: 'Utilisateur',
    cell: (user) => (
      <div>
        <Link href={`/users/${user.id}`} className="font-medium text-slate-900 hover:underline">
          {user.fullName}
        </Link>
        <p className="text-xs text-slate-500">{user.email}</p>
      </div>
    ),
  },
  {
    key: 'role',
    header: 'Rôle',
    cell: (user) => (
      <Badge tone={user.role === UserRole.ADMIN ? 'info' : 'neutral'}>
        {user.role === UserRole.ADMIN ? 'Administrateur' : 'Touriste'}
      </Badge>
    ),
  },
  {
    key: 'state',
    header: 'État',
    cell: (user) => (
      <Badge tone={user.isActive ? 'success' : 'danger'}>
        {user.isActive ? 'Actif' : 'Désactivé'}
      </Badge>
    ),
  },
  {
    key: 'createdAt',
    header: 'Inscrit le',
    hideOnMobile: true,
    cell: (user) => formatDate(user.createdAt),
  },
  {
    key: 'actions',
    header: 'Actions',
    align: 'right',
    cell: (user) => (
      <Link href={`/users/${user.id}`} className="text-sm text-brand-700 hover:underline">
        Gérer
      </Link>
    ),
  },
];
