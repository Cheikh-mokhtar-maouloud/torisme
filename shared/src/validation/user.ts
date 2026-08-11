import { z } from 'zod';

import { UserRole } from '../constants/enums';
import { paginationSchema, phoneSchema } from './primitives';

export const userListQuerySchema = paginationSchema.extend({
  /** Recherche sur le nom ou l'email. */
  search: z.string().trim().min(1).max(120).optional(),
  role: z.enum(UserRole).optional(),
  isActive: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),
  sortBy: z.string().trim().max(50).optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});
export type UserListQuery = z.infer<typeof userListQuerySchema>;

/**
 * Champs qu'un administrateur peut modifier sur un compte.
 *
 * `email` et `passwordHash` en sont absents : changer l'email d'un tiers permet
 * une prise de contrôle du compte, et un mot de passe ne se réinitialise que par
 * le parcours de récupération (Phase 8).
 */
export const adminUpdateUserSchema = z.object({
  fullName: z.string().trim().min(2).max(100).optional(),
  phone: phoneSchema.optional(),
  role: z.enum(UserRole).optional(),
  isActive: z.boolean().optional(),
});
export type AdminUpdateUserInput = z.infer<typeof adminUpdateUserSchema>;
