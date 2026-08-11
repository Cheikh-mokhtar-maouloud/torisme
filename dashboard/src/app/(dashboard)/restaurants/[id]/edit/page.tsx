import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { PlaceType } from '@tourism/shared/constants';
import type { Restaurant } from '@tourism/shared/types';

import { ImageManager } from '@/components/forms/image-manager';
import { PageHeader } from '@/components/ui/primitives';
import { api, ApiRequestError } from '@/lib/api/client';
import { loadCategoryOptions } from '@/lib/api/resources';

import { RestaurantForm } from '../../restaurant-form';

export const metadata: Metadata = { title: 'Modifier un restaurant — Administration' };

export default async function EditRestaurantPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let restaurant: Restaurant;
  try {
    restaurant = await api.get<Restaurant>(`/api/restaurants/${id}`);
  } catch (error) {
    if (error instanceof ApiRequestError && (error.status === 404 || error.status === 422)) {
      notFound();
    }
    throw error;
  }

  const categories = await loadCategoryOptions(PlaceType.RESTAURANT);

  return (
    <>
      <PageHeader title="Modifier le restaurant" description={restaurant.name} />
      <RestaurantForm restaurant={restaurant} categories={categories} />

      <div className="mt-8 border-t border-slate-200 pt-6">
        <ImageManager
          resource="restaurants"
          entityId={restaurant.id}
          images={restaurant.images ?? []}
        />
      </div>
    </>
  );
}
