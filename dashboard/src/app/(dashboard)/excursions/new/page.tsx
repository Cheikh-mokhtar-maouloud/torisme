import type { Metadata } from 'next';

import { PageHeader } from '@/components/ui/primitives';

import { ExcursionForm } from '../excursion-form';

export const metadata: Metadata = { title: 'Nouvelle excursion — Administration' };

export default function NewExcursionPage() {
  return (
    <>
      <PageHeader
        title="Nouvelle excursion"
        description="Les places restantes sont initialisées au nombre de places totales."
      />
      <ExcursionForm />
    </>
  );
}
