import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import type { Attraction } from '@tourism/shared/types';

import { DeleteButton } from '@/components/forms/form-shell';
import { ButtonLink } from '@/components/ui/button';
import { Card, PageHeader, StatusBadge } from '@/components/ui/primitives';
import { api, ApiRequestError } from '@/lib/api/client';
import { formatMoney } from '@/lib/format';

import { deleteAttractionAction } from '../actions';

type PageProps = { params: Promise<{ id: string }> };

async function loadAttraction(id: string): Promise<Attraction> {
  try {
    return await api.get<Attraction>(`/api/attractions/${id}`);
  } catch (error) {
    if (error instanceof ApiRequestError && (error.status === 404 || error.status === 422)) {
      notFound();
    }
    throw error;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const attraction = await loadAttraction((await params).id);
  return { title: `${attraction.name} — Administration` };
}

export default async function AttractionDetailPage({ params }: PageProps) {
  const { id } = await params;
  const attraction = await loadAttraction(id);

  return (
    <>
      <PageHeader
        title={attraction.name}
        description={`${attraction.address.city}, ${attraction.address.country}`}
        actions={
          <>
            <ButtonLink href="/attractions" variant="ghost">
              ← Liste
            </ButtonLink>
            <ButtonLink href={`/attractions/${id}/edit`} variant="secondary">
              Modifier
            </ButtonLink>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="mb-4">
            <StatusBadge status={attraction.status} />
          </div>
          <p className="text-sm whitespace-pre-line text-slate-700">{attraction.description}</p>
        </Card>

        <Card className="divide-y divide-slate-100 text-sm">
          <Row
            label="Entrée"
            value={
              attraction.entryFee
                ? formatMoney(attraction.entryFee, attraction.currency ?? 'MRU')
                : 'Gratuite'
            }
          />
          <Row
            label="Coordonnées"
            value={`${attraction.location.coordinates[1]}, ${attraction.location.coordinates[0]}`}
          />
          <Row
            label="Note"
            value={
              attraction.reviewCount > 0
                ? `${attraction.rating.toFixed(1)} (${attraction.reviewCount})`
                : '—'
            }
          />
        </Card>
      </div>

      <section className="mt-8 border-t border-slate-200 pt-5">
        <h2 className="text-sm font-semibold text-slate-900">Zone sensible</h2>
        <p className="mt-1 mb-3 max-w-xl text-sm text-slate-600">
          La suppression retire définitivement la fiche de la carte et des listes.
        </p>
        <DeleteButton
          action={deleteAttractionAction.bind(null, id)}
          label="Supprimer l’attraction"
          confirmMessage={`Supprimer définitivement « ${attraction.name} » ?`}
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
