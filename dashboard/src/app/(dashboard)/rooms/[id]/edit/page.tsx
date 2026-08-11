import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import type { Room } from '@tourism/shared/types';

import { ImageManager } from '@/components/forms/image-manager';
import { PageHeader } from '@/components/ui/primitives';
import { api, ApiRequestError } from '@/lib/api/client';
import { loadHotelOptions } from '@/lib/api/resources';

import { RoomForm } from '../../room-form';

export const metadata: Metadata = { title: 'Modifier une chambre — Administration' };

export default async function EditRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let room: Room;
  try {
    room = await api.get<Room>(`/api/rooms/${id}`);
  } catch (error) {
    if (error instanceof ApiRequestError && (error.status === 404 || error.status === 422)) {
      notFound();
    }
    throw error;
  }

  const hotels = await loadHotelOptions();

  return (
    <>
      <PageHeader title="Modifier la chambre" description={room.name} />
      <RoomForm room={room} hotels={hotels} />

      <div className="mt-8 border-t border-slate-200 pt-6">
        <ImageManager resource="rooms" entityId={room.id} images={room.images ?? []} />
      </div>
    </>
  );
}
