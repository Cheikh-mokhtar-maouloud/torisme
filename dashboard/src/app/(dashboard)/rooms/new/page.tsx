import type { Metadata } from 'next';

import { PageHeader } from '@/components/ui/primitives';
import { loadHotelOptions } from '@/lib/api/resources';

import { RoomForm } from '../room-form';

export const metadata: Metadata = { title: 'Nouvelle chambre — Administration' };

export default async function NewRoomPage({
  searchParams,
}: {
  searchParams: Promise<{ hotelId?: string }>;
}) {
  // `?hotelId=` permet d'arriver ici depuis la fiche d'un hôtel avec la
  // sélection déjà faite.
  const [{ hotelId }, hotels] = await Promise.all([searchParams, loadHotelOptions()]);

  return (
    <>
      <PageHeader
        title="Nouvelle chambre"
        description="La chambre doit être publiée pour devenir réservable."
      />
      <RoomForm hotels={hotels} {...(hotelId ? { defaultHotelId: hotelId } : {})} />
    </>
  );
}
