import { z } from 'zod';

import { partialUpdateSchema } from './partial-update';

import { Currency } from '../constants/enums';
import { listQuerySchema, placeBaseSchema } from './common';
import { geoQuerySchema, timeOfDaySchema } from './primitives';

/**
 * Les champs dérivés (`rating`, `reviewCount`, `minPricePerNight`) sont absents
 * de ces schémas : ils sont recalculés côté serveur à partir des avis et des
 * chambres, et ne doivent jamais être acceptés depuis un client.
 */
export const createHotelSchema = placeBaseSchema.extend({
  stars: z.coerce.number().int().min(1).max(5).optional(),
  amenities: z.array(z.string().trim().min(1).max(60)).max(50).default([]),
  rules: z.array(z.string().trim().min(1).max(300)).max(30).default([]),
  checkInTime: timeOfDaySchema.default('14:00'),
  checkOutTime: timeOfDaySchema.default('12:00'),
  phone: z.string().trim().max(30).optional(),
  currency: z.enum(Currency),
});
export type CreateHotelInput = z.infer<typeof createHotelSchema>;

export const updateHotelSchema = partialUpdateSchema(createHotelSchema);
export type UpdateHotelInput = z.infer<typeof updateHotelSchema>;

export const hotelListQuerySchema = listQuerySchema
  .extend({
    minStars: z.coerce.number().int().min(1).max(5).optional(),
    maxPrice: z.coerce.number().positive().optional(),
    /** Liste séparée par des virgules : `?amenities=wifi,piscine`. */
    amenities: z
      .string()
      .optional()
      .transform((value) =>
        value
          ? value
              .split(',')
              .map((item) => item.trim())
              .filter(Boolean)
          : undefined,
      ),
  })
  .and(geoQuerySchema);
export type HotelListQuery = z.infer<typeof hotelListQuerySchema>;
