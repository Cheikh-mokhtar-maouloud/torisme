import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import type { Hotel } from '@tourism/shared/types';

import { PageHeader } from '@/components/ui/primitives';
import { api, ApiRequestError } from '@/lib/api/client';

import { HotelForm } from '../../hotel-form';

export const metadata: Metadata = { title: 'Modifier un hôtel — Administration' };

export default async function EditHotelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let hotel: Hotel;
  try {
    hotel = await api.get<Hotel>(`/api/hotels/${id}`);
  } catch (error) {
    if (error instanceof ApiRequestError && (error.status === 404 || error.status === 422)) {
      notFound();
    }
    throw error;
  }

  return (
    <>
      <PageHeader title="Modifier l’hôtel" description={hotel.name} />
      <HotelForm hotel={hotel} />
    </>
  );
}
