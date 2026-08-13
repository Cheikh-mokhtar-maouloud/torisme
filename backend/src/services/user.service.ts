import { UserRole } from '@tourism/shared/constants';
import type { User as UserDto } from '@tourism/shared/types';
import type { AdminUpdateUserInput, UserListQuery } from '@tourism/shared/validation';

import { HttpError } from '@/lib/errors';
import { SecurityEvent, securityEvent } from '@/lib/security-log';
import { buildSort, escapeRegex, paginateQuery, type PaginatedResult } from '@/lib/query';
import { serializeDocument } from '@/lib/serialize';
import { User } from '@/models';

const SORTABLE_FIELDS = ['createdAt', 'fullName', 'email'] as const;

export async function listUsers(query: UserListQuery): Promise<PaginatedResult<UserDto>> {
  const filter: Record<string, unknown> = {};

  if (query.role) filter.role = query.role;
  if (query.isActive !== undefined) filter.isActive = query.isActive;

  if (query.search) {
    // Recherche partielle sur deux champs. Le terme est échappé : un utilisateur
    // qui saisit « a+b » ne doit pas construire une expression régulière valide.
    const pattern = escapeRegex(query.search);
    filter.$or = [
      { fullName: { $regex: pattern, $options: 'i' } },
      { email: { $regex: pattern, $options: 'i' } },
    ];
  }

  const sort = buildSort(query.sortBy, query.sortOrder, SORTABLE_FIELDS, { createdAt: -1 });

  return paginateQuery(User, filter, { page: query.page, limit: query.limit, sort }, (doc) =>
    serializeDocument<UserDto>(doc),
  );
}

export async function getUserById(id: string): Promise<UserDto> {
  const user = await User.findById(id).lean();
  if (!user) throw HttpError.notFound('Utilisateur introuvable');
  return serializeDocument<UserDto>(user);
}

/**
 * Modifie un compte depuis l'administration.
 *
 * `actorId` est l'administrateur qui effectue l'action : il ne peut ni se
 * désactiver, ni se retirer son propre rôle. Sans cette garde, une fausse
 * manipulation peut verrouiller le dernier administrateur hors du dashboard,
 * situation qui ne se rattrape qu'en écrivant directement en base.
 */
export async function adminUpdateUser(
  id: string,
  input: AdminUpdateUserInput,
  actorId: string,
): Promise<UserDto> {
  if (id === actorId) {
    if (input.isActive === false) {
      throw HttpError.conflict('Vous ne pouvez pas désactiver votre propre compte');
    }
    if (input.role !== undefined && input.role !== UserRole.ADMIN) {
      throw HttpError.conflict('Vous ne pouvez pas retirer votre propre rôle administrateur');
    }
  }

  // Retirer le rôle du dernier administrateur actif produirait le même blocage.
  const isDemotingAnAdmin = input.role !== undefined && input.role !== UserRole.ADMIN;
  const isDeactivating = input.isActive === false;

  if (isDemotingAnAdmin || isDeactivating) {
    const target = await User.findById(id).select('role isActive').lean();
    if (!target) throw HttpError.notFound('Utilisateur introuvable');

    if (target.role === UserRole.ADMIN && target.isActive) {
      const activeAdmins = await User.countDocuments({
        role: UserRole.ADMIN,
        isActive: true,
      });
      if (activeAdmins <= 1) {
        throw HttpError.conflict('Il doit rester au moins un administrateur actif');
      }
    }
  }

  const updated = await User.findByIdAndUpdate(
    id,
    { $set: input },
    { new: true, runValidators: true },
  ).lean();

  if (!updated) throw HttpError.notFound('Utilisateur introuvable');

  /*
   * Tracé même lorsque l'opération est parfaitement légitime. C'est le principe
   * d'une piste d'audit : après un incident, la question posée est « qui a
   * donné ce rôle, et quand », et elle ne peut recevoir de réponse que si
   * l'enregistrement a eu lieu avant qu'on ne sache qu'il y aurait incident.
   */
  if (input.role !== undefined || input.isActive !== undefined) {
    securityEvent(SecurityEvent.PRIVILEGE_CHANGED, {
      userId: id,
      detail: `par ${actorId} — ${input.role !== undefined ? `rôle ${input.role}` : ''}${
        input.isActive !== undefined ? ` actif ${input.isActive}` : ''
      }`.trim(),
    });
  }

  return serializeDocument<UserDto>(updated);
}
