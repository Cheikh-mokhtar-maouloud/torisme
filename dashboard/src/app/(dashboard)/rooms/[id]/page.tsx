import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import type { Hotel, Room } from '@tourism/shared/types';

import { DeleteButton } from '@/components/forms/form-shell';
import { ButtonLink } from '@/components/ui/button';
import { Card, PageHeader, StatusBadge } from '@/components/ui/primitives';
import { api, ApiRequestError } from '@/lib/api/client';
import { formatMoney } from '@/lib/format';

import { deleteRoomAction } from '../actions';

type PageProps = { params: Promise<{ id: string }> };

async function loadRoom(id: string): Promise<Room> {
  try {
    return await api.get<Room>(`/api/rooms/${id}`);
  } catch (error) {
    if (error instanceof ApiRequestError && (error.status === 404 || error.status === 422)) {
      notFound();
    }
    throw error;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const room = await loadRoom((await params).id);
  return { title: `${room.name} — Administration` };
}

export default async function RoomDetailPage({ params }: PageProps) {
  const { id } = await params;
  const room = await loadRoom(id);
  const hotel = await api.get<Hotel>(`/api/hotels/${room.hotelId}`);

  return (
    <>
      <PageHeader
        title={room.name}
        description={hotel.name}
        actions={
          <>
            <ButtonLink href={`/hotels/${room.hotelId}`} variant="ghost">
              ← Hôtel
            </ButtonLink>
            <ButtonLink href={`/rooms/${id}/edit`} variant="secondary">
              Modifier
            </ButtonLink>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="mb-4">
            <StatusBadge status={room.status} />
          </div>
          <p className="text-sm whitespace-pre-line text-slate-700">{room.description}</p>

          {room.amenities.length > 0 && (
            <div className="mt-5">
              <h2 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                Équipements
              </h2>
              <p className="mt-1 text-sm text-slate-700">{room.amenities.join(' · ')}</p>
            </div>
          )}
        </Card>

        <Card className="divide-y divide-slate-100 text-sm">
          <Row label="Prix / nuit" value={formatMoney(room.pricePerNight, room.currency)} />
          <Row label="Capacité" value={`${room.capacity} personne(s)`} />
          <Row label="Lits" value={String(room.bedCount)} />
          <Row label="Unités" value={String(room.totalUnits)} />
        </Card>
      </div>

      <section className="mt-8 border-t border-slate-200 pt-5">
        <h2 className="text-sm font-semibold text-slate-900">Zone sensible</h2>
        <p className="mt-1 mb-3 max-w-xl text-sm text-slate-600">
          La suppression retire ce type de chambre de l’hôtel et met à jour son prix minimum.
        </p>
        <DeleteButton
          action={deleteRoomAction.bind(null, id, room.hotelId)}
          label="Supprimer la chambre"
          confirmMessage={`Supprimer définitivement « ${room.name} » ?`}
        />
      </section>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2.5">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-900">{value}</dd>
    </div>
  );
}
