import { z } from 'zod';

import { partialUpdateSchema } from './partial-update';

import { categoryIdsSchema, listQuerySchema, openingHoursSchema, placeBaseSchema } from './common';
import { geoQuerySchema, objectIdSchema } from './primitives';

export const createRestaurantSchema = placeBaseSchema.extend({
  cuisineTypes: z.array(z.string().trim().min(1).max(60)).max(15).default([]),
  /** Gamme de prix de 1 (économique) à 4 (haut de gamme). */
  /*
   * Facultative. La gamme de prix est une appréciation, pas un fait relevé :
   * l'exiger obligeait à en inventer une pour chaque fiche importée, et une
   * information inventée vaut moins qu'une information absente.
   */
  priceRange: z.coerce.number().int().min(1).max(4).optional(),
  phone: z.string().trim().max(30).optional(),
  openingHours: openingHoursSchema.optional(),
  menuUrl: z.url().optional(),
  categoryIds: categoryIdsSchema,
});
export type CreateRestaurantInput = z.infer<typeof createRestaurantSchema>;

export const updateRestaurantSchema = partialUpdateSchema(createRestaurantSchema);
export type UpdateRestaurantInput = z.infer<typeof updateRestaurantSchema>;

export const restaurantListQuerySchema = listQuerySchema
  .extend({
    categoryId: objectIdSchema.optional(),
    cuisine: z.string().trim().max(60).optional(),
    maxPriceRange: z.coerce.number().int().min(1).max(4).optional(),
  })
  .and(geoQuerySchema);
export type RestaurantListQuery = z.infer<typeof restaurantListQuerySchema>;
