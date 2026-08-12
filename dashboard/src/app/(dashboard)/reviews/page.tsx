import type { Metadata } from 'next';

import { PlaceType, ReviewStatus } from '@tourism/shared/constants';
import type { Review } from '@tourism/shared/types';

import { FilterBar } from '@/components/data/filter-bar';
import { Pagination } from '@/components/data/pagination';
import { Card, EmptyState, PageHeader } from '@/components/ui/primitives';
import { api, toSearchParams } from '@/lib/api/client';
import { formatDate } from '@/lib/format';

import { ReviewCard } from './review-card';

export const metadata: Metadata = { title: 'Avis — Administration' };

interface SearchParams {
  page?: string;
  status?: string;
  reportedOnly?: string;
}

/** Chemin d'API par type de cible, pour retrouver le nom du lieu noté. */
const TARGET_PATHS: Record<string, string> = {
  [PlaceType.HOTEL]: '/api/hotels',
  [PlaceType.RESTAURANT]: '/api/restaurants',
  [PlaceType.ATTRACTION]: '/api/attractions',
  [PlaceType.EXCURSION]: '/api/excursions',
};

export default async function ReviewsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  // Par défaut, la file de modération : c'est le travail à faire, pas l'archive.
  const status = params.status ?? (params.reportedOnly ? undefined : ReviewStatus.PENDING);

  const query = toSearchParams({
    page: params.page ?? '1',
    limit: 20,
    status,
    reportedOnly: params.reportedOnly,
  });

  const { items, meta } = await api.list<Review>(`/api/reviews${query}`);

  /*
   * Auteurs et lieux sont résolus en parallèle, et tolèrent l'absence : un
   * compte supprimé ou une fiche retirée ne doit pas rendre la file de
   * modération inutilisable.
   */
  const [authors, targets] = await Promise.all([
    Promise.all(items.map((review) => safeName(`/api/users/${review.userId}`, 'fullName'))),
    Promise.all(
      items.map((review) =>
        safeName(`${TARGET_PATHS[review.targetType]}/${review.targetId}`, 'name', 'title'),
      ),
    ),
  ]);

  return (
    <>
      <PageHeader
        title="Avis"
        description="Les avis n’apparaissent dans l’application qu’une fois approuvés."
      />

      <Card className="mb-4">
        <FilterBar
          basePath="/reviews"
          search={undefined}
          filters={[
            {
              name: 'status',
              label: 'Statut',
              value: params.status,
              options: [
                { value: ReviewStatus.PENDING, label: 'En attente' },
                { value: ReviewStatus.APPROVED, label: 'Approuvés' },
                { value: ReviewStatus.REJECTED, label: 'Rejetés' },
              ],
            },
            {
              name: 'reportedOnly',
              label: 'Signalés',
              value: params.reportedOnly,
              options: [{ value: 'true', label: 'Signalés uniquement' }],
            },
          ]}
        />
      </Card>

      {items.length === 0 ? (
        <Card>
          <EmptyState
            title="Aucun avis"
            description={
              status === ReviewStatus.PENDING
                ? 'Rien à modérer pour le moment.'
                : 'Aucun avis ne correspond à ces critères.'
            }
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {items.map((review, index) => (
            <ReviewCard
              key={review.id}
              review={review}
              authorName={authors[index] ?? 'Compte supprimé'}
              targetName={targets[index] ?? 'Fiche supprimée'}
              formattedDate={formatDate(review.createdAt)}
            />
          ))}
        </div>
      )}

      <Card className="mt-4">
        <Pagination
          meta={meta}
          basePath="/reviews"
          params={{ status: params.status, reportedOnly: params.reportedOnly }}
        />
      </Card>
    </>
  );
}

/** Lecture tolérante d'un libellé : `undefined` si la ressource a disparu. */
async function safeName(path: string, ...fields: string[]): Promise<string | undefined> {
  try {
    const entity = await api.get<Record<string, unknown>>(path);
    for (const field of fields) {
      if (typeof entity[field] === 'string') return entity[field];
    }
    return undefined;
  } catch {
    return undefined;
  }
}
