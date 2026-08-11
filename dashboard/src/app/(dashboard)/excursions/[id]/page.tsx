import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import type { Excursion } from '@tourism/shared/types';

import { DeleteButton } from '@/components/forms/form-shell';
import { ButtonLink } from '@/components/ui/button';
import { Card, PageHeader, StatusBadge } from '@/components/ui/primitives';
import { api, ApiRequestError } from '@/lib/api/client';
import { formatDateTime, formatDuration, formatMoney } from '@/lib/format';

import { deleteExcursionAction } from '../actions';
import { ExcursionParticipants } from './participants';

type PageProps = { params: Promise<{ id: string }> };

async function loadExcursion(id: string): Promise<Excursion> {
  try {
    return await api.get<Excursion>(`/api/excursions/${id}`);
  } catch (error) {
    if (error instanceof ApiRequestError && (error.status === 404 || error.status === 422)) {
      notFound();
    }
    throw error;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const excursion = await loadExcursion((await params).id);
  return { title: `${excursion.title} — Administration` };
}

export default async function ExcursionDetailPage({ params }: PageProps) {
  const { id } = await params;
  const excursion = await loadExcursion(id);

  const soldSeats = excursion.totalSeats - excursion.availableSeats;

  return (
    <>
      <PageHeader
        title={excursion.title}
        description={excursion.destination}
        actions={
          <>
            <ButtonLink href="/excursions" variant="ghost">
              ← Liste
            </ButtonLink>
            <ButtonLink href={`/excursions/${id}/edit`} variant="secondary">
              Modifier
            </ButtonLink>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="mb-4">
            <StatusBadge status={excursion.status} />
          </div>
          <p className="text-sm whitespace-pre-line text-slate-700">{excursion.description}</p>

          {excursion.itinerary.length > 0 && (
            <div className="mt-6">
              <h2 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                Programme
              </h2>
              <ol className="mt-2 space-y-2 border-l border-slate-200 pl-4">
                {excursion.itinerary.map((step, index) => (
                  <li key={`${step.title}-${index}`} className="text-sm">
                    <span className="font-medium text-slate-900">
                      {step.time ? `${step.time} — ` : ''}
                      {step.title}
                    </span>
                    {step.description && <p className="text-slate-600">{step.description}</p>}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </Card>

        <Card className="divide-y divide-slate-100 text-sm">
          <Row label="Départ" value={formatDateTime(excursion.startsAt)} />
          <Row label="Durée" value={formatDuration(excursion.durationMinutes)} />
          <Row label="Prix" value={formatMoney(excursion.price, excursion.currency)} />
          <Row
            label="Places"
            value={`${excursion.availableSeats} libres sur ${excursion.totalSeats}`}
          />
          <Row label="Réservées" value={String(soldSeats)} />
          <Row label="Guide" value={excursion.guideName ?? '—'} />
          <Row
            label="Point de départ"
            value={`${excursion.departureLocation.coordinates[1]}, ${excursion.departureLocation.coordinates[0]}`}
          />
        </Card>
      </div>

      <ExcursionParticipants excursionId={id} />

      <section className="mt-8 border-t border-slate-200 pt-5">
        <h2 className="text-sm font-semibold text-slate-900">Zone sensible</h2>
        <p className="mt-1 mb-3 max-w-xl text-sm text-slate-600">
          {soldSeats > 0
            ? `${soldSeats} place(s) sont réservées : la suppression est refusée. Passez le statut à « Annulée » pour informer les clients.`
            : 'Aucune place réservée : l’excursion peut être supprimée.'}
        </p>
        <DeleteButton
          action={deleteExcursionAction.bind(null, id)}
          label="Supprimer l’excursion"
          confirmMessage={`Supprimer définitivement « ${excursion.title} » ?`}
        />
      </section>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2.5">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className="truncate text-right font-medium text-slate-900">{value}</dd>
    </div>
  );
}
