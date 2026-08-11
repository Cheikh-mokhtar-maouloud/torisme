import { z } from 'zod';

import type { ImageRef } from '@tourism/shared/types';

import { created } from '@/lib/api-response';
import { requireAdmin } from '@/lib/auth/guard';
import { HttpError } from '@/lib/errors';
import { withRoute } from '@/lib/handler';
import { logger } from '@/lib/logger';
import { inspectImage, storage } from '@/lib/storage';

/**
 * POST /api/uploads
 *
 * Téléverse une image et renvoie sa référence, à joindre ensuite au champ
 * `images` d'une fiche.
 *
 * Le fichier transite par l'API — et non directement vers le fournisseur — afin
 * que le serveur puisse inspecter les **octets réels**. En téléversement
 * direct, le client déclare une URL et un type que rien ne permet de
 * contredire.
 *
 * Conséquence assumée : le corps est plafonné par l'hébergeur (4,5 Mo sur
 * Vercel), d'où la limite de 4 Mo côté application.
 */

/** Dossiers autorisés : liste blanche, jamais une valeur libre du client. */
const folderSchema = z.enum([
  'hotels',
  'rooms',
  'restaurants',
  'attractions',
  'excursions',
  'reviews',
]);

export const POST = withRoute(async (request) => {
  await requireAdmin(request);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw HttpError.validation('Requête multipart invalide');
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    throw HttpError.validation('Aucun fichier reçu', { file: ['Champ « file » requis'] });
  }

  const folderResult = folderSchema.safeParse(form.get('folder') ?? 'hotels');
  if (!folderResult.success) {
    throw HttpError.validation('Dossier de destination inconnu');
  }

  // Le fichier est lu entièrement en mémoire : borné à 4 Mo, c'est acceptable,
  // et l'inspection des octets impose de toute façon de disposer de l'en-tête.
  const data = Buffer.from(await file.arrayBuffer());

  // Lève une 422 si le fichier est vide, trop lourd ou d'un format non accepté.
  const inspection = inspectImage(data);

  const provider = storage();
  const stored = await provider.upload({
    data,
    contentType: inspection.contentType,
    folder: folderResult.data,
  });

  logger.info('image téléversée', {
    provider: provider.name,
    folder: folderResult.data,
    bytes: stored.bytes,
    contentType: inspection.contentType,
  });

  // `order` est laissé à 0 : c'est le dashboard qui décide de la position dans
  // la galerie au moment d'attacher l'image à une fiche.
  const image: ImageRef = {
    url: stored.url,
    providerId: stored.providerId,
    order: 0,
    ...((stored.width ?? inspection.width) ? { width: stored.width ?? inspection.width } : {}),
    ...((stored.height ?? inspection.height) ? { height: stored.height ?? inspection.height } : {}),
  };

  return created(image);
});
