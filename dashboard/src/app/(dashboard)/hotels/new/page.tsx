import type { Metadata } from 'next';

import { PageHeader } from '@/components/ui/primitives';

import { HotelForm } from '../hotel-form';

export const metadata: Metadata = { title: 'Nouvel hôtel — Administration' };

export default function NewHotelPage() {
  return (
    <>
      <PageHeader
        title="Nouvel hôtel"
        description="L’établissement est créé en brouillon : il ne sera visible dans l’application qu’une fois publié."
      />
      <HotelForm />
    </>
  );
}
