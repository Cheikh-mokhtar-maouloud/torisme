import type { Metadata } from 'next';

import { ButtonLink } from '@/components/ui/button';
import { Card, PageHeader } from '@/components/ui/primitives';
import { api } from '@/lib/api/client';
import { formatNumber } from '@/lib/format';

export const metadata: Metadata = { title: 'Tableau de bord — Administration' };

interface PlatformStats {
  users: { total: number; admins: number; inactive: number };
  hotels: { total: number; published: number; drafts: number };
  rooms: { total: number; published: number };
  restaurants: { total: number; published: number };
  attractions: { total: number; published: number };
  excursions: { total: number; upcoming: number; seatsRemaining: number };
}

export default async function DashboardPage() {
  const stats = await api.get<PlatformStats>('/api/admin/stats');

  const tiles = [
    {
      label: 'Hôtels',
      value: stats.hotels.total,
      detail: `${stats.hotels.published} publiés · ${stats.hotels.drafts} brouillons`,
      href: '/hotels',
    },
    {
      label: 'Chambres',
      value: stats.rooms.total,
      detail: `${stats.rooms.published} publiées`,
      href: '/rooms',
    },
    {
      label: 'Restaurants',
      value: stats.restaurants.total,
      detail: `${stats.restaurants.published} publiés`,
      href: '/restaurants',
    },
    {
      label: 'Attractions',
      value: stats.attractions.total,
      detail: `${stats.attractions.published} publiées`,
      href: '/attractions',
    },
    {
      label: 'Excursions',
      value: stats.excursions.total,
      detail: `${stats.excursions.upcoming} à venir · ${formatNumber(stats.excursions.seatsRemaining)} places`,
      href: '/excursions',
    },
    {
      label: 'Utilisateurs',
      value: stats.users.total,
      detail: `${stats.users.admins} admin · ${stats.users.inactive} désactivés`,
      href: '/users',
    },
  ];

  return (
    <>
      <PageHeader
        title="Tableau de bord"
        description="Vue d’ensemble du contenu publié sur la plateforme."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {tiles.map((tile) => (
          <Card key={tile.label} className="p-4">
            <p className="text-sm text-slate-500">{tile.label}</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{formatNumber(tile.value)}</p>
            <p className="mt-1 text-xs text-slate-500">{tile.detail}</p>
            <ButtonLink href={tile.href} variant="ghost" size="sm" className="-ml-2.5 mt-3">
              Gérer →
            </ButtonLink>
          </Card>
        ))}
      </div>

      {stats.hotels.drafts > 0 && (
        <Card className="mt-6 p-4">
          <h2 className="text-sm font-semibold text-slate-900">À traiter</h2>
          <p className="mt-1 text-sm text-slate-600">
            {stats.hotels.drafts} fiche{stats.hotels.drafts > 1 ? 's' : ''} d’hôtel en brouillon
            {stats.hotels.drafts > 1 ? ' ne sont' : ' n’est'} pas visible dans l’application mobile.
          </p>
          <ButtonLink href="/hotels?status=DRAFT" variant="secondary" size="sm" className="mt-3">
            Voir les brouillons
          </ButtonLink>
        </Card>
      )}
    </>
  );
}
