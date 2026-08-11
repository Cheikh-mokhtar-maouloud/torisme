import { z } from 'zod';

import { partialUpdateSchema } from './partial-update';

import { ContentStatus, Currency } from '../constants/enums';
import { listQuerySchema } from './common';
import { imageRefSchema, objectIdSchema } from './primitives';

export const createRoomSchema = z.object({
  hotelId: objectIdSchema,
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().min(10).max(3_000),
  images: z.array(imageRefSchema).max(30).default([]),
  capacity: z.coerce.number().int().min(1).max(20),
  bedCount: z.coerce.number().int().min(1).max(10),
  amenities: z.array(z.string().trim().min(1).max(60)).max(50).default([]),
  pricePerNight: z.coerce.number().positive().max(100_000_000),
  currency: z.enum(Currency),
  /** Nombre d'unités physiques de ce type de chambre — base du calcul de disponibilité. */
  totalUnits: z.coerce.number().int().min(1).max(500),
  status: z.enum(ContentStatus).default(ContentStatus.DRAFT),
});
export type CreateRoomInput = z.infer<typeof createRoomSchema>;

/**
 * `hotelId` n'est pas modifiable : déplacer une chambre d'un hôtel à l'autre
 * rendrait incohérentes les réservations déjà enregistrées sur cette chambre.
 */
export const updateRoomSchema = partialUpdateSchema(createRoomSchema.omit({ hotelId: true }));
export type UpdateRoomInput = z.infer<typeof updateRoomSchema>;

export const roomListQuerySchema = listQuerySchema.extend({
  hotelId: objectIdSchema.optional(),
  minCapacity: z.coerce.number().int().min(1).max(20).optional(),
  maxPrice: z.coerce.number().positive().optional(),
});
export type RoomListQuery = z.infer<typeof roomListQuerySchema>;
