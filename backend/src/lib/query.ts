import type { Model, QueryFilter, SortOrder } from 'mongoose';

import { ContentStatus, GEO } from '@tourism/shared/constants';
import type { PaginationMeta } from '@tourism/shared/types';

import { buildPaginationMeta } from './api-response';

/**
 * Filtres et pagination communs aux listes.
 *
 * Toutes les listes passent par ici afin qu'aucune route ne puisse renvoyer une
 * collection entière : `limit` est déjà borné à 100 par le schéma Zod, et
 * `skip`/`limit` sont systématiquement appliqués.
 */

interface BaseListFilters {
  search?: string | undefined;
  city?: string | undefined;
  countryCode?: string | undefined;
  status?: ContentStatus | undefined;
}

interface GeoFilters {
  latitude?: number | undefined;
  longitude?: number | undefined;
  radiusMeters?: number | undefined;
}

/**
 * Construit le filtre commun à un lieu.
 *
 * `isAdmin` décide de la visibilité : un visiteur ne voit que les fiches
 * publiées, un administrateur voit tout. Ce contrôle est fait ici plutôt que
 * dans chaque route, pour qu'aucune n'oublie d'exclure les brouillons.
 */
export function buildPlaceFilter(
  filters: BaseListFilters & GeoFilters,
  isAdmin: boolean,
): QueryFilter<Record<string, unknown>> {
  const query: QueryFilter<Record<string, unknown>> = {};

  if (isAdmin) {
    if (filters.status) query.status = filters.status;
  } else {
    query.status = ContentStatus.PUBLISHED;
  }

  if (filters.city) {
    // Correspondance exacte insensible à la casse, sans interpréter les
    // métacaractères que l'utilisateur pourrait saisir.
    query['address.city'] = { $regex: `^${escapeRegex(filters.city)}$`, $options: 'i' };
  }

  if (filters.countryCode) {
    query['address.countryCode'] = filters.countryCode.toUpperCase();
  }

  if (filters.search) {
    query.$text = { $search: filters.search };
  }

  if (filters.latitude !== undefined && filters.longitude !== undefined) {
    // `$geoWithin` plutôt que `$nearSphere` : ce dernier impose un tri par
    // distance et MongoDB l'interdit dans un pipeline d'agrégation — or
    // `countDocuments()` en est un, ce qui ferait échouer toute liste paginée
    // avec filtre géographique.
    //
    // `$centerSphere` attend un rayon en radians, d'où la division par le rayon
    // terrestre. Le tri par distance croissante relève d'un endpoint dédié à la
    // carte (Phase 6), construit sur `$geoNear`.
    const radiusMeters = filters.radiusMeters ?? GEO.DEFAULT_RADIUS_METERS;
    query.location = {
      $geoWithin: {
        $centerSphere: [
          [filters.longitude, filters.latitude],
          radiusMeters / GEO.EARTH_RADIUS_METERS,
        ],
      },
    };
  }

  return query;
}

/** Neutralise les métacaractères d'une expression régulière issue d'une saisie. */
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Traduit `sortBy`/`sortOrder` en tri Mongoose.
 *
 * `allowedFields` est une liste blanche : sans elle, un client pourrait trier
 * sur un champ non indexé et provoquer un tri en mémoire coûteux sur une grande
 * collection.
 */
export function buildSort(
  sortBy: string | undefined,
  sortOrder: 'asc' | 'desc',
  allowedFields: readonly string[],
  fallback: Record<string, SortOrder>,
): Record<string, SortOrder> {
  if (!sortBy || !allowedFields.includes(sortBy)) return fallback;
  return { [sortBy]: sortOrder === 'asc' ? 1 : -1 };
}

export interface PaginatedResult<T> {
  items: T[];
  meta: PaginationMeta;
}

/**
 * Exécute une liste paginée : compte et page de résultats en parallèle.
 *
 * `lean()` renvoie des objets JavaScript simples plutôt que des documents
 * Mongoose — nettement moins coûteux quand on ne fait que lire.
 */
export async function paginateQuery<TDoc, TResult>(
  model: Model<TDoc>,
  filter: QueryFilter<TDoc>,
  options: {
    page: number;
    limit: number;
    sort: Record<string, SortOrder>;
    projection?: Record<string, 0 | 1>;
  },
  serialize: (doc: unknown) => TResult,
): Promise<PaginatedResult<TResult>> {
  const skip = (options.page - 1) * options.limit;

  const [total, docs] = await Promise.all([
    model.countDocuments(filter),
    model
      .find(filter, options.projection)
      .sort(options.sort)
      .skip(skip)
      .limit(options.limit)
      .lean(),
  ]);

  return {
    items: docs.map(serialize),
    meta: buildPaginationMeta(options.page, options.limit, total),
  };
}
