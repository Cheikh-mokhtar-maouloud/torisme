import type { Metadata } from 'next';

import { PlaceType } from '@tourism/shared/constants';

import { PageHeader } from '@/components/ui/primitives';
import { loadCategoryOptions } from '@/lib/api/resources';

import { RestaurantForm } from '../restaurant-form';

export const metadata: Metadata = { title: 'Nouveau restaurant — Administration' };

export default async function NewRestaurantPage() {
  const categories = await loadCategoryOptions(PlaceType.RESTAURANT);

  return (
    <>
      <PageHeader
        title="Nouveau restaurant"
        description="La fiche est créée en brouillon et n’apparaîtra sur la carte qu’une fois publiée."
      />
      <RestaurantForm categories={categories} />
    </>
  );
}
