import { z } from 'zod';

import { partialUpdateSchema } from './partial-update';

import { PlaceType } from '../constants/enums';
import { paginationSchema } from './primitives';

export const createCategorySchema = z.object({
  name: z.string().trim().min(2).max(80),
  /** Identifiant lisible et stable, utilisé dans les URL de filtre. */
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug invalide (minuscules, chiffres et tirets)'),
  appliesTo: z.enum(PlaceType),
  iconUrl: z.url().optional(),
  isActive: z.boolean().default(true),
});
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = partialUpdateSchema(createCategorySchema);
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

export const categoryListQuerySchema = paginationSchema.extend({
  appliesTo: z.enum(PlaceType).optional(),
  isActive: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),
});
export type CategoryListQuery = z.infer<typeof categoryListQuerySchema>;
