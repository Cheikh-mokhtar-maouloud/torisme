import { ContentStatus } from '@tourism/shared/constants';
import type { Attraction as AttractionDto } from '@tourism/shared/types';
import type {
  AttractionListQuery,
  CreateAttractionInput,
  UpdateAttractionInput,
} from '@tourism/shared/validation';

import { HttpError } from '@/lib/errors';
import { buildPlaceFilter, buildSort, paginateQuery, type PaginatedResult } from '@/lib/query';
import { serializeDocument } from '@/lib/serialize';
import { Attraction } from '@/models';

const SORTABLE_FIELDS = ['rating', 'entryFee', 'createdAt', 'name'] as const;

export async function listAttractions(
  query: AttractionListQuery,
  isAdmin: boolean,
): Promise<PaginatedResult<AttractionDto>> {
  const filter = buildPlaceFilter(query, isAdmin);

  if (query.categoryId) filter.categoryIds = query.categoryId;

  // « Gratuit » couvre l'absence de tarif comme un tarif à zéro : les deux
  // représentations existent en base selon la façon dont la fiche a été saisie.
  if (query.freeOnly) {
    filter.$or = [{ entryFee: { $exists: false } }, { entryFee: 0 }, { entryFee: null }];
  }

  const sort = buildSort(query.sortBy, query.sortOrder, SORTABLE_FIELDS, {
    rating: -1,
    createdAt: -1,
  });

  return paginateQuery(Attraction, filter, { page: query.page, limit: query.limit, sort }, (doc) =>
    serializeDocument<AttractionDto>(doc),
  );
}

export async function getAttractionById(id: string, isAdmin: boolean): Promise<AttractionDto> {
  const attraction = await Attraction.findById(id).lean();
  if (!attraction) throw HttpError.notFound('Attraction introuvable');

  if (!isAdmin && attraction.status !== ContentStatus.PUBLISHED) {
    throw HttpError.notFound('Attraction introuvable');
  }

  return serializeDocument<AttractionDto>(attraction);
}

export async function createAttraction(input: CreateAttractionInput): Promise<AttractionDto> {
  const created = await Attraction.create(input);
  return serializeDocument<AttractionDto>(created.toObject());
}

export async function updateAttraction(
  id: string,
  input: UpdateAttractionInput,
): Promise<AttractionDto> {
  const updated = await Attraction.findByIdAndUpdate(
    id,
    { $set: input },
    { new: true, runValidators: true },
  ).lean();

  if (!updated) throw HttpError.notFound('Attraction introuvable');
  return serializeDocument<AttractionDto>(updated);
}

export async function deleteAttraction(id: string): Promise<void> {
  const deleted = await Attraction.findByIdAndDelete(id).lean();
  if (!deleted) throw HttpError.notFound('Attraction introuvable');
}
