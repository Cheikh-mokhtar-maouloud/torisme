import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import type { ReadableOptions } from 'node:stream';

import { env } from '@/config/env';
import { localUploadRoot } from '@/lib/storage';

/**
 * GET /api/files/<chemin>
 *
 * Sert les fichiers du stockage local, en développement uniquement.
 *
 * Une route dédiée plutôt que le dossier `public/` de Next : ce dernier n'est
 * lu qu'à la construction, si bien qu'un fichier téléversé pendant l'exécution
 * renvoie 404. Le cas a été rencontré et corrigé en Phase 7.
 *
 * En production, `STORAGE_PROVIDER=cloudinary` et les URL pointent vers le CDN
 * du fournisseur : cette route n'est jamais sollicitée.
 */
const CONTENT_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  if (env().STORAGE_PROVIDER !== 'local') {
    return new Response('Not found', { status: 404 });
  }

  const { path } = await context.params;
  const root = resolve(localUploadRoot());
  const target = resolve(join(root, ...path));

  /*
   * Garde contre la traversée de répertoire.
   *
   * Le chemin est reconstruit puis comparé à la racine : une requête contenant
   * « .. » sort du dossier et se retrouve rejetée ici, avant toute lecture.
   * Le préfixe est complété d'un séparateur, sans quoi « /uploads-secret »
   * passerait le test face à une racine « /uploads ».
   */
  if (target !== root && !target.startsWith(root + sep)) {
    return new Response('Not found', { status: 404 });
  }

  let size: number;
  try {
    const info = await stat(target);
    if (!info.isFile()) return new Response('Not found', { status: 404 });
    size = info.size;
  } catch {
    return new Response('Not found', { status: 404 });
  }

  const extension = target.split('.').pop()?.toLowerCase() ?? '';
  const contentType = CONTENT_TYPES[extension];
  // Ne servir que des types connus : renvoyer un fichier arbitraire depuis ce
  // dossier ouvrirait la voie à du contenu interprété par le navigateur.
  if (!contentType) return new Response('Not found', { status: 404 });

  const stream = createReadStream(target) as unknown as ReadableOptions & AsyncIterable<Buffer>;

  return new Response(streamToWeb(stream), {
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(size),
      // Le nom de fichier contient un identifiant aléatoire : le contenu ne
      // change jamais pour une URL donnée, le cache peut être définitif.
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

/** Convertit un flux Node en flux web, attendu par `Response`. */
function streamToWeb(source: AsyncIterable<Buffer>): ReadableStream<Uint8Array> {
  return new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of source) controller.enqueue(new Uint8Array(chunk));
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}
