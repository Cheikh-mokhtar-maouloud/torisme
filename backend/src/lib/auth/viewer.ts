import type { NextRequest } from 'next/server';

import { UserRole } from '@tourism/shared/constants';

import { optionalAuth } from './guard';

/**
 * Détermine si la requête doit voir les contenus non publiés.
 *
 * Les routes de lecture sont publiques, mais un administrateur connecté doit
 * pouvoir prévisualiser ses brouillons depuis le dashboard sans endpoint séparé.
 * Un visiteur anonyme ou un utilisateur standard ne voit que le contenu publié.
 */
export async function isAdminViewer(request: NextRequest): Promise<boolean> {
  const auth = await optionalAuth(request);
  return auth?.role === UserRole.ADMIN;
}
