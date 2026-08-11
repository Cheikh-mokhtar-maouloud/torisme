import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { PlaceType } from '@tourism/shared/constants';
import type { Attraction } from '@tourism/shared/types';

import { ImageManager } from '@/components/forms/image-manager';
import { PageHeader } from '@/components/ui/primitives';
import { api, ApiRequestError } from '@/lib/api/client';
import { loadCategoryOptions } from '@/lib/api/resources';

import { AttractionForm } from '../../attraction-form';

export const metadata: Metadata = { title: 'Modifier une attraction — Administration' };

export default async function EditAttractionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let attraction: Attraction;
  try {
    attraction = await api.get<Attraction>(`/api/attractions/${id}`);
  } catch (error) {
    if (error instanceof ApiRequestError && (error.status === 404 || error.status === 422)) {
      notFound();
    }
    throw error;
  }

  const categories = await loadCategoryOptions(PlaceType.ATTRACTION);

  return (
    <>
      <PageHeader title="Modifier l’attraction" description={attraction.name} />
      <AttractionForm attraction={attraction} categories={categories} />

      <div className="mt-8 border-t border-slate-200 pt-6">
        <ImageManager
          resource="attractions"
          entityId={attraction.id}
          images={attraction.images ?? []}
        />
      </div>
    </>
  );
}
