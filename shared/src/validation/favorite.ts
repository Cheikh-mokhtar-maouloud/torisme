import { z } from 'zod';

import { PlaceType } from '../constants/enums';
import { objectIdSchema, paginationSchema } from './primitives';

export const createFavoriteSchema = z.object({
  targetType: z.enum(PlaceType),
  targetId: objectIdSchema,
});
export type CreateFavoriteInput = z.infer<typeof createFavoriteSchema>;

export const favoriteListQuerySchema = paginationSchema.extend({
  targetType: z.enum(PlaceType).optional(),
});
export type FavoriteListQuery = z.infer<typeof favoriteListQuerySchema>;
