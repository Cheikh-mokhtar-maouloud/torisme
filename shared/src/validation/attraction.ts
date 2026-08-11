import { z } from 'zod';

import { Currency } from '../constants/enums';
import { categoryIdsSchema, listQuerySchema, openingHoursSchema, placeBaseSchema } from './common';
import { geoQuerySchema, objectIdSchema } from './primitives';

export const createAttractionSchema = placeBaseSchema.extend({
  categoryIds: categoryIdsSchema,
  openingHours: openingHoursSchema.optional(),
  /** Absent ou 0 = entrée gratuite. */
  entryFee: z.coerce.number().min(0).max(100_000_000).optional(),
  currency: z.enum(Currency).optional(),
});
export type CreateAttractionInput = z.infer<typeof createAttractionSchema>;

export const updateAttractionSchema = createAttractionSchema.partial();
export type UpdateAttractionInput = z.infer<typeof updateAttractionSchema>;

export const attractionListQuerySchema = listQuerySchema
  .extend({
    categoryId: objectIdSchema.optional(),
    freeOnly: z
      .enum(['true', 'false'])
      .optional()
      .transform((value) => value === 'true'),
  })
  .and(geoQuerySchema);
export type AttractionListQuery = z.infer<typeof attractionListQuerySchema>;
