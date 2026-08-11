import 'server-only';

import { ContentStatus } from '@tourism/shared/constants';
import type { Category, Hotel } from '@tourism/shared/types';

import { api } from './client';

/**
 * Lectures auxiliaires servant à alimenter les listes déroulantes des
 * formulaires (hôtel d'une chambre, catégories d'un restaurant…).
 *
 * Elles sont plafonnées à 100 entrées, limite maximale de l'API. Au-delà, ces
 * sélecteurs devront devenir des champs de recherche — un `<select>` de plusieurs
 * centaines d'options est de toute façon inutilisable.
 */

export async function loadHotelOptions(): Promise<Pick<Hotel, 'id' | 'name'>[]> {
  const { items } = await api.list<Hotel>('/api/hotels?limit=100&sortBy=name&sortOrder=asc');
  return items.map((hotel) => ({ id: hotel.id, name: hotel.name }));
}

export async function loadCategoryOptions(
  appliesTo: string,
): Promise<Pick<Category, 'id' | 'name'>[]> {
  const { items } = await api.list<Category>(`/api/categories?appliesTo=${appliesTo}&limit=100`);
  return items.map((category) => ({ id: category.id, name: category.name }));
}

/** Options de statut, partagées par les filtres de liste. */
export const CONTENT_STATUS_OPTIONS = [
  { value: ContentStatus.PUBLISHED, label: 'Publié' },
  { value: ContentStatus.DRAFT, label: 'Brouillon' },
  { value: ContentStatus.ARCHIVED, label: 'Archivé' },
];
