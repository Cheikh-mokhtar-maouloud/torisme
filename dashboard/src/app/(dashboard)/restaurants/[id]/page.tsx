import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import type { Restaurant } from '@tourism/shared/types';

import { DeleteButton } from '@/components/forms/form-shell';
import { ButtonLink } from '@/components/ui/button';
import { Card, PageHeader, StatusBadge } from '@/components/ui/primitives';
import { api, ApiRequestError } from '@/lib/api/client';

import { deleteRestaurantAction } from '../actions';

type PageProps = { params: Promise<{ id: string }> };

async function loadRestaurant(id: string): Promise<Restaurant> {
  try {
    return await api.get<Restaurant>(`/api/restaurants/${id}`);
  } catch (error) {
    if (error instanceof ApiRequestError && (error.status === 404 || error.status === 422)) {
      notFound();
    }
    throw error;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const restaurant = await loadRestaurant((await params).id);
  return { title: `${restaurant.name} — Administration` };
}

export default async function RestaurantDetailPage({ params }: PageProps) {
  const { id } = await params;
  const restaurant = await loadRestaurant(id);

  return (
    <>
      <PageHeader
        title={restaurant.name}
        description={`${restaurant.address.city}, ${restaurant.address.country}`}
        actions={
          <>
            <ButtonLink href="/restaurants" variant="ghost">
              ← Liste
            </ButtonLink>
            <ButtonLink href={`/restaurants/${id}/edit`} variant="secondary">
              Modifier
            </ButtonLink>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="mb-4">
            <StatusBadge status={restaurant.status} />
          </div>
          <p className="text-sm whitespace-pre-line text-slate-700">{restaurant.description}</p>

          {restaurant.cuisineTypes.length > 0 && (
            <div className="mt-5">
              <h2 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                Cuisine
              </h2>
              <p className="mt-1 text-sm text-slate-700">{restaurant.cuisineTypes.join(' · ')}</p>
            </div>
          )}
        </Card>

        <Card className="divide-y divide-slate-100 text-sm">
          <Row label="Gamme de prix" value={'€'.repeat(restaurant.priceRange)} />
          <Row label="Téléphone" value={restaurant.phone ?? '—'} />
          <Row label="Menu" value={restaurant.menuUrl ?? '—'} />
          <Row
            label="Coordonnées"
            value={`${restaurant.location.coordinates[1]}, ${restaurant.location.coordinates[0]}`}
          />
          <Row
            label="Note"
            value={
              restaurant.reviewCount > 0
                ? `${restaurant.rating.toFixed(1)} (${restaurant.reviewCount})`
                : '—'
            }
          />
        </Card>
      </div>

      <section className="mt-8 border-t border-slate-200 pt-5">
        <h2 className="text-sm font-semibold text-slate-900">Zone sensible</h2>
        <p className="mt-1 mb-3 max-w-xl text-sm text-slate-600">
          La suppression retire définitivement la fiche de la carte et des listes.
        </p>
        <DeleteButton
          action={deleteRestaurantAction.bind(null, id)}
          label="Supprimer le restaurant"
          confirmMessage={`Supprimer définitivement « ${restaurant.name} » ?`}
        />
      </section>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2.5">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className="truncate text-right font-medium text-slate-900">{value}</dd>
    </div>
  );
}
