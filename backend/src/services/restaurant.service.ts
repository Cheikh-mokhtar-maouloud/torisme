import { ContentStatus } from '@tourism/shared/constants';
import type { Restaurant as RestaurantDto } from '@tourism/shared/types';
import type {
  CreateRestaurantInput,
  RestaurantListQuery,
  UpdateRestaurantInput,
} from '@tourism/shared/validation';

import { HttpError } from '@/lib/errors';
import { buildPlaceFilter, buildSort, paginateQuery, type PaginatedResult } from '@/lib/query';
import { serializeDocument } from '@/lib/serialize';
import { Restaurant } from '@/models';

const SORTABLE_FIELDS = ['rating', 'priceRange', 'createdAt', 'name'] as const;

export async function listRestaurants(
  query: RestaurantListQuery,
  isAdmin: boolean,
): Promise<PaginatedResult<RestaurantDto>> {
  const filter = buildPlaceFilter(query, isAdmin);

  if (query.categoryId) filter.categoryIds = query.categoryId;
  if (query.cuisine) filter.cuisineTypes = query.cuisine;
  if (query.maxPriceRange !== undefined) filter.priceRange = { $lte: query.maxPriceRange };

  const sort = buildSort(query.sortBy, query.sortOrder, SORTABLE_FIELDS, {
    rating: -1,
    createdAt: -1,
  });

  return paginateQuery(Restaurant, filter, { page: query.page, limit: query.limit, sort }, (doc) =>
    serializeDocument<RestaurantDto>(doc),
  );
}

export async function getRestaurantById(id: string, isAdmin: boolean): Promise<RestaurantDto> {
  const restaurant = await Restaurant.findById(id).lean();
  if (!restaurant) throw HttpError.notFound('Restaurant introuvable');

  if (!isAdmin && restaurant.status !== ContentStatus.PUBLISHED) {
    throw HttpError.notFound('Restaurant introuvable');
  }

  return serializeDocument<RestaurantDto>(restaurant);
}

export async function createRestaurant(input: CreateRestaurantInput): Promise<RestaurantDto> {
  const created = await Restaurant.create(input);
  return serializeDocument<RestaurantDto>(created.toObject());
}

export async function updateRestaurant(
  id: string,
  input: UpdateRestaurantInput,
): Promise<RestaurantDto> {
  const updated = await Restaurant.findByIdAndUpdate(
    id,
    { $set: input },
    { new: true, runValidators: true },
  ).lean();

  if (!updated) throw HttpError.notFound('Restaurant introuvable');
  return serializeDocument<RestaurantDto>(updated);
}

export async function deleteRestaurant(id: string): Promise<void> {
  const deleted = await Restaurant.findByIdAndDelete(id).lean();
  if (!deleted) throw HttpError.notFound('Restaurant introuvable');
}
