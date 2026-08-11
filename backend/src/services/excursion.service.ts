import { ExcursionStatus } from '@tourism/shared/constants';
import type { Excursion as ExcursionDto } from '@tourism/shared/types';
import type {
  CreateExcursionInput,
  ExcursionListQuery,
  UpdateExcursionInput,
} from '@tourism/shared/validation';

import { HttpError } from '@/lib/errors';
import { buildSort, escapeRegex, paginateQuery, type PaginatedResult } from '@/lib/query';
import { serializeDocument } from '@/lib/serialize';
import { Excursion } from '@/models';

const SORTABLE_FIELDS = ['startsAt', 'price', 'rating', 'createdAt'] as const;

export async function listExcursions(
  query: ExcursionListQuery,
  isAdmin: boolean,
): Promise<PaginatedResult<ExcursionDto>> {
  const filter: Record<string, unknown> = {};

  if (isAdmin) {
    if (query.excursionStatus) filter.status = query.excursionStatus;
  } else {
    // Un visiteur ne voit que les excursions ouvertes ou complètes : une
    // excursion annulée n'a pas à apparaître dans la liste publique.
    filter.status = query.excursionStatus ?? {
      $in: [ExcursionStatus.SCHEDULED, ExcursionStatus.FULL],
    };
  }

  // Par défaut la liste ne montre que l'avenir : proposer une excursion passée
  // à la réservation n'a pas de sens côté client.
  const dateFilter: Record<string, Date> = {};
  if (query.from) dateFilter.$gte = query.from;
  if (query.to) dateFilter.$lte = query.to;
  if (!query.includePast && !query.from) dateFilter.$gte = new Date();
  if (Object.keys(dateFilter).length > 0) filter.startsAt = dateFilter;

  if (query.maxPrice !== undefined) filter.price = { $lte: query.maxPrice };
  if (query.availableOnly) filter.availableSeats = { $gt: 0 };
  if (query.search) filter.$text = { $search: query.search };
  if (query.city) {
    filter.destination = { $regex: `^${escapeRegex(query.city)}$`, $options: 'i' };
  }

  const sort = buildSort(query.sortBy, query.sortOrder, SORTABLE_FIELDS, { startsAt: 1 });

  return paginateQuery(Excursion, filter, { page: query.page, limit: query.limit, sort }, (doc) =>
    serializeDocument<ExcursionDto>(doc),
  );
}

export async function getExcursionById(id: string, isAdmin: boolean): Promise<ExcursionDto> {
  const excursion = await Excursion.findById(id).lean();
  if (!excursion) throw HttpError.notFound('Excursion introuvable');

  if (!isAdmin && excursion.status === ExcursionStatus.CANCELLED) {
    // La fiche reste accessible aux administrateurs, mais pas au public.
    throw HttpError.notFound('Excursion introuvable');
  }

  return serializeDocument<ExcursionDto>(excursion);
}

export async function createExcursion(input: CreateExcursionInput): Promise<ExcursionDto> {
  // À la création, toutes les places sont disponibles. `availableSeats` n'est
  // pas dans le schéma d'entrée : il est dérivé ici puis géré exclusivement par
  // le service de réservation (Phase 9).
  const created = await Excursion.create({ ...input, availableSeats: input.totalSeats });
  return serializeDocument<ExcursionDto>(created.toObject());
}

/**
 * Met à jour une excursion.
 *
 * Augmenter `totalSeats` doit augmenter d'autant les places restantes ; le
 * réduire ne doit jamais faire passer `availableSeats` sous zéro ni sous le
 * nombre de places déjà vendues. Le calcul se fait donc par delta, pas par
 * affectation directe.
 */
export async function updateExcursion(
  id: string,
  input: UpdateExcursionInput,
): Promise<ExcursionDto> {
  const current = await Excursion.findById(id).select('totalSeats availableSeats').lean();
  if (!current) throw HttpError.notFound('Excursion introuvable');

  const update: Record<string, unknown> = { ...input };

  if (input.totalSeats !== undefined && input.totalSeats !== current.totalSeats) {
    const soldSeats = current.totalSeats - current.availableSeats;

    if (input.totalSeats < soldSeats) {
      throw HttpError.conflict(
        `${soldSeats} place(s) sont déjà réservées : le total ne peut pas être inférieur.`,
      );
    }

    update.availableSeats = input.totalSeats - soldSeats;
  }

  const updated = await Excursion.findByIdAndUpdate(
    id,
    { $set: update },
    { new: true, runValidators: true },
  ).lean();

  if (!updated) throw HttpError.notFound('Excursion introuvable');
  return serializeDocument<ExcursionDto>(updated);
}

/**
 * Une excursion ayant des places vendues n'est pas supprimée mais annulée :
 * supprimer le document rendrait orphelines les réservations des clients.
 */
export async function deleteExcursion(id: string): Promise<void> {
  const excursion = await Excursion.findById(id).select('totalSeats availableSeats').lean();
  if (!excursion) throw HttpError.notFound('Excursion introuvable');

  const soldSeats = excursion.totalSeats - excursion.availableSeats;
  if (soldSeats > 0) {
    throw HttpError.conflict(
      `${soldSeats} place(s) sont réservées. Annulez l'excursion au lieu de la supprimer.`,
    );
  }

  await Excursion.findByIdAndDelete(id);
}
