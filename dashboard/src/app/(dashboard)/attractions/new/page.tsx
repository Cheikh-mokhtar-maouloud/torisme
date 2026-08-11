import type { Metadata } from 'next';

import { PlaceType } from '@tourism/shared/constants';

import { PageHeader } from '@/components/ui/primitives';
import { loadCategoryOptions } from '@/lib/api/resources';

import { AttractionForm } from '../attraction-form';

export const metadata: Metadata = { title: 'Nouvelle attraction — Administration' };

export default async function NewAttractionPage() {
  const categories = await loadCategoryOptions(PlaceType.ATTRACTION);

  return (
    <>
      <PageHeader
        title="Nouvelle attraction"
        description="La fiche est créée en brouillon et n’apparaîtra sur la carte qu’une fois publiée."
      />
      <AttractionForm categories={categories} />
    </>
  );
}
