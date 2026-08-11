import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import type { Hotel, Room } from '@tourism/shared/types';

import { DeleteButton } from '@/components/forms/form-shell';
import { ButtonLink } from '@/components/ui/button';
import { Card, EmptyState, PageHeader, StatusBadge } from '@/components/ui/primitives';
import { api, ApiRequestError } from '@/lib/api/client';
import { formatMoney } from '@/lib/format';

import { deleteHotelAction } from '../actions';

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const hotel = await loadHotel((await params).id);
  return { title: `${hotel.name} — Administration` };
}

async function loadHotel(id: string): Promise<Hotel> {
  try {
    return await api.get<Hotel>(`/api/hotels/${id}`);
  } catch (error) {
    // 404 comme 422 (identifiant malformé) mènent à la même page « introuvable » :
    // l'administrateur n'a pas à distinguer les deux.
    if (error instanceof ApiRequestError && (error.status === 404 || error.status === 422)) {
      notFound();
    }
    throw error;
  }
}

export default async function HotelDetailPage({ params }: PageProps) {
  const { id } = await params;
  const hotel = await loadHotel(id);
  const rooms = await api.list<Room>(`/api/hotels/${id}/rooms`);

  const deleteAction = deleteHotelAction.bind(null, id);

  return (
    <>
      <PageHeader
        title={hotel.name}
        description={`${hotel.address.city}, ${hotel.address.country}`}
        actions={
          <>
            <ButtonLink href="/hotels" variant="ghost">
              ← Liste
            </ButtonLink>
            <ButtonLink href={`/hotels/${id}/edit`} variant="secondary">
              Modifier
            </ButtonLink>
            <ButtonLink href={`/rooms/new?hotelId=${id}`}>Ajouter une chambre</ButtonLink>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="mb-4 flex items-center gap-2">
            <StatusBadge status={hotel.status} />
            {hotel.stars && <span className="text-sm text-slate-500">{hotel.stars} étoiles</span>}
          </div>

          <p className="text-sm whitespace-pre-line text-slate-700">{hotel.description}</p>

          {hotel.amenities.length > 0 && (
            <div className="mt-5">
              <h2 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                Équipements
              </h2>
              <p className="mt-1 text-sm text-slate-700">{hotel.amenities.join(' · ')}</p>
            </div>
          )}

          {hotel.rules && hotel.rules.length > 0 && (
            <div className="mt-4">
              <h2 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                Règles
              </h2>
              <ul className="mt-1 list-inside list-disc text-sm text-slate-700">
                {hotel.rules.map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        <Card className="divide-y divide-slate-100 text-sm">
          <Row label="Prix minimum" value={formatMoney(hotel.minPricePerNight, hotel.currency)} />
          <Row label="Arrivée" value={hotel.checkInTime} />
          <Row label="Départ" value={hotel.checkOutTime} />
          <Row label="Téléphone" value={hotel.phone ?? '—'} />
          <Row
            label="Coordonnées"
            value={`${hotel.location.coordinates[1]}, ${hotel.location.coordinates[0]}`}
          />
          <Row
            label="Note"
            value={
              hotel.reviewCount > 0 ? `${hotel.rating.toFixed(1)} (${hotel.reviewCount})` : '—'
            }
          />
        </Card>
      </div>

      <section className="mt-6">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">
          Chambres <span className="font-normal text-slate-500">({rooms.meta.total})</span>
        </h2>

        <Card>
          {rooms.items.length === 0 ? (
            <EmptyState
              title="Aucune chambre"
              description="Un hôtel sans chambre publiée n’est pas réservable."
              action={
                <ButtonLink href={`/rooms/new?hotelId=${id}`}>Ajouter une chambre</ButtonLink>
              }
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {rooms.items.map((room) => (
                <li key={room.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <Link
                      href={`/rooms/${room.id}`}
                      className="text-sm font-medium text-slate-900 hover:underline"
                    >
                      {room.name}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {room.capacity} pers. · {room.bedCount} lit(s) · {room.totalUnits} unité(s)
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-sm text-slate-700">
                      {formatMoney(room.pricePerNight, room.currency)}
                    </span>
                    <StatusBadge status={room.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      <section className="mt-8 border-t border-slate-200 pt-5">
        <h2 className="text-sm font-semibold text-slate-900">Zone sensible</h2>
        <p className="mt-1 mb-3 max-w-xl text-sm text-slate-600">
          La suppression efface l’hôtel et ses chambres. Elle est refusée tant qu’une chambre est
          publiée : dépubliez-les d’abord.
        </p>
        <DeleteButton
          action={deleteAction}
          label="Supprimer l’hôtel"
          confirmMessage={`Supprimer définitivement « ${hotel.name} » et ses chambres ?`}
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
