import type { NextRequest } from 'next/server';

import { UserRole } from '@tourism/shared/constants';

import { User } from '@/models';

import { connectToDatabase } from '../db';
import { HttpError } from '../errors';
import { verifyAccessToken } from './jwt';
import { extractToken } from './session';

export interface AuthContext {
  userId: string;
  role: UserRole;
  email: string;
}

/**
 * Exige un utilisateur authentifié.
 *
 * Le jeton est vérifié cryptographiquement **puis** l'utilisateur est relu en
 * base. Cette seconde lecture a un coût, mais elle est nécessaire : sans elle,
 * un compte désactivé ou rétrogradé garderait ses droits jusqu'à l'expiration
 * du jeton. Le cache Redis de la Phase 13 supprimera ce coût.
 */
export async function requireAuth(request: NextRequest): Promise<AuthContext> {
  const token = extractToken(request);
  if (!token) throw HttpError.unauthorized();

  const payload = await verifyAccessToken(token);
  if (!payload) throw HttpError.unauthorized('Jeton invalide ou expiré');

  await connectToDatabase();
  const user = await User.findById(payload.sub).select('role email isActive').lean();

  if (!user) throw HttpError.unauthorized('Compte introuvable');
  if (!user.isActive) throw HttpError.forbidden('Compte désactivé');

  return { userId: payload.sub, role: user.role as UserRole, email: user.email };
}

/** Exige le rôle ADMIN. Le rôle vient de la base, jamais du seul jeton. */
export async function requireAdmin(request: NextRequest): Promise<AuthContext> {
  const auth = await requireAuth(request);
  if (auth.role !== UserRole.ADMIN) {
    throw HttpError.forbidden('Droits administrateur requis');
  }
  return auth;
}

/**
 * Authentification facultative : renvoie le contexte si un jeton valide est
 * présent, `null` sinon. Sert aux routes publiques qui enrichissent leur
 * réponse pour un utilisateur connecté (favoris, par exemple).
 */
export async function optionalAuth(request: NextRequest): Promise<AuthContext | null> {
  try {
    return await requireAuth(request);
  } catch {
    return null;
  }
}
