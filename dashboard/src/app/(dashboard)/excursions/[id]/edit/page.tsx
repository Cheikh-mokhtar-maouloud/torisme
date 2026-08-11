import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import type { Excursion } from '@tourism/shared/types';

import { ImageManager } from '@/components/forms/image-manager';
import { PageHeader } from '@/components/ui/primitives';
import { api, ApiRequestError } from '@/lib/api/client';

import { ExcursionForm } from '../../excursion-form';

export const metadata: Metadata = { title: 'Modifier une excursion — Administration' };

export default async function EditExcursionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let excursion: Excursion;
  try {
    excursion = await api.get<Excursion>(`/api/excursions/${id}`);
  } catch (error) {
    if (error instanceof ApiRequestError && (error.status === 404 || error.status === 422)) {
      notFound();
    }
    throw error;
  }

  return (
    <>
      <PageHeader title="Modifier l’excursion" description={excursion.title} />
      <ExcursionForm excursion={excursion} />

      <div className="mt-8 border-t border-slate-200 pt-6">
        <ImageManager
          resource="excursions"
          entityId={excursion.id}
          images={excursion.images ?? []}
        />
      </div>
    </>
  );
}
