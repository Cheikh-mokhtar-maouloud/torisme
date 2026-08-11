'use server';

import { revalidatePath } from 'next/cache';

import { UPLOAD } from '@tourism/shared/constants';
import type { ImageRef } from '@tourism/shared/types';

import { toFormState } from '../api/action-result';
import { api } from '../api/client';
import { getSessionToken } from '../auth/session';
import { config } from '../config';
import type { FormState } from '../forms';

/**
 * Gestion des galeries d'images.
 *
 * Les images sont embarquées dans la fiche (`images[]`) : les manipuler revient
 * à relire la fiche, modifier le tableau et le renvoyer. Il n'existe donc pas
 * d'endpoint « image » côté API, hormis le téléversement et la suppression du
 * fichier lui-même.
 */

/**
 * Ressources dont on peut gérer la galerie.
 *
 * Liste blanche stricte : le chemin d'API est construit à partir de cette clé,
 * jamais d'une valeur envoyée par le navigateur. Sans elle, un client pourrait
 * faire écrire l'action sur n'importe quelle route.
 */
const RESOURCES = {
  hotels: { path: '/api/hotels', folder: 'hotels' },
  rooms: { path: '/api/rooms', folder: 'rooms' },
  restaurants: { path: '/api/restaurants', folder: 'restaurants' },
  attractions: { path: '/api/attractions', folder: 'attractions' },
  excursions: { path: '/api/excursions', folder: 'excursions' },
} as const;

export type ImageResource = keyof typeof RESOURCES;

interface WithImages {
  id: string;
  images: ImageRef[];
}

/** Renumérote les positions après toute modification, pour qu'elles restent contiguës. */
function reindex(images: ImageRef[]): ImageRef[] {
  return images.map((image, index) => ({ ...image, order: index }));
}

async function loadImages(resource: ImageResource, id: string): Promise<ImageRef[]> {
  const entity = await api.get<WithImages>(`${RESOURCES[resource].path}/${id}`);
  return [...(entity.images ?? [])].sort((a, b) => a.order - b.order);
}

async function saveImages(resource: ImageResource, id: string, images: ImageRef[]): Promise<void> {
  await api.put(`${RESOURCES[resource].path}/${id}`, { images: reindex(images) });
  revalidatePath(`/${resource}/${id}`);
  revalidatePath(`/${resource}/${id}/edit`);
  revalidatePath(`/${resource}`);
}

export async function uploadImageAction(
  resource: ImageResource,
  id: string,
  _previous: FormState,
  data: FormData,
): Promise<FormState> {
  const file = data.get('file');

  if (!(file instanceof File) || file.size === 0) {
    return { status: 'error', message: 'Sélectionnez une image.' };
  }

  const maxMegabytes = Math.round(UPLOAD.MAX_IMAGE_SIZE_BYTES / (1024 * 1024));
  if (file.size > UPLOAD.MAX_IMAGE_SIZE_BYTES) {
    // Contrôle de confort : l'API revérifie de toute façon, mais autant éviter
    // de transférer plusieurs mégaoctets pour se faire refuser ensuite.
    return { status: 'error', message: `Image trop lourde (maximum ${maxMegabytes} Mo).` };
  }

  try {
    const existing = await loadImages(resource, id);

    if (existing.length >= UPLOAD.MAX_IMAGES_PER_ENTITY) {
      return {
        status: 'error',
        message: `Maximum ${UPLOAD.MAX_IMAGES_PER_ENTITY} images par fiche.`,
      };
    }

    const uploaded = await uploadFile(file, RESOURCES[resource].folder);
    await saveImages(resource, id, [...existing, uploaded]);
  } catch (error) {
    return toFormState(error);
  }

  return { status: 'idle', message: 'Image ajoutée.' };
}

/**
 * Téléversement du fichier vers l'API.
 *
 * `api.post` sérialise en JSON : le multipart est donc construit à la main ici,
 * avec le jeton de session repris du cookie. Le fichier ne transite jamais par
 * le navigateur vers l'API — il passe par le serveur du dashboard, comme tous
 * les autres appels.
 */
async function uploadFile(file: File, folder: string): Promise<ImageRef> {
  const token = await getSessionToken();

  const form = new FormData();
  form.append('file', file);
  form.append('folder', folder);

  const response = await fetch(`${config.apiUrl}/api/uploads`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });

  const payload = (await response.json()) as
    { success: true; data: ImageRef } | { success: false; error: { message: string } };

  if (!payload.success) throw new Error(payload.error.message);

  return payload.data;
}

/**
 * Retire une image de la galerie **et** supprime le fichier stocké.
 *
 * L'ordre compte : la fiche est mise à jour d'abord. Si la suppression du
 * fichier échoue ensuite, il reste un fichier orphelin chez le fournisseur —
 * gênant mais sans conséquence visible. L'ordre inverse pourrait laisser la
 * fiche pointer vers un fichier disparu, donc une image cassée pour tous.
 */
export async function removeImageAction(
  resource: ImageResource,
  id: string,
  providerId: string,
): Promise<void> {
  const existing = await loadImages(resource, id);
  const remaining = existing.filter((image) => image.providerId !== providerId);

  await saveImages(resource, id, remaining);

  if (providerId) {
    try {
      await api.delete(`/api/uploads/${providerId}`);
    } catch {
      // Fichier orphelin : sans effet pour l'utilisateur, on n'échoue pas.
    }
  }
}

/** Promeut une image en couverture : c'est celle d'ordre 0 qui est affichée. */
export async function setMainImageAction(
  resource: ImageResource,
  id: string,
  providerId: string,
): Promise<void> {
  const existing = await loadImages(resource, id);
  const target = existing.find((image) => image.providerId === providerId);
  if (!target) return;

  await saveImages(resource, id, [
    target,
    ...existing.filter((image) => image.providerId !== providerId),
  ]);
}

export async function moveImageAction(
  resource: ImageResource,
  id: string,
  providerId: string,
  direction: 'up' | 'down',
): Promise<void> {
  const existing = await loadImages(resource, id);
  const index = existing.findIndex((image) => image.providerId === providerId);
  if (index === -1) return;

  const target = direction === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= existing.length) return;

  const reordered = [...existing];
  const [moved] = reordered.splice(index, 1);
  reordered.splice(target, 0, moved!);

  await saveImages(resource, id, reordered);
}
