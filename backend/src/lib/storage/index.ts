import { join } from 'node:path';

import { env } from '@/config/env';

import { CloudinaryStorageProvider } from './cloudinary-provider';
import { LocalStorageProvider } from './local-provider';
import type { StorageProvider } from './types';

export type { StorageProvider, StoredImage, UploadInput } from './types';
export { inspectImage } from './image-inspection';

let cached: StorageProvider | undefined;

/**
 * Fabrique du fournisseur de stockage.
 *
 * Le choix se fait au premier usage à partir de `STORAGE_PROVIDER`. Le
 * fournisseur local est explicitement refusé hors développement : il écrit sur
 * un système de fichiers éphémère et non partagé entre instances, ce qui
 * produirait des images qui disparaissent au redéploiement — une panne
 * silencieuse et difficile à diagnostiquer.
 */
export function storage(): StorageProvider {
  if (cached) return cached;

  const config = env();

  if (config.STORAGE_PROVIDER === 'cloudinary') {
    if (
      !config.CLOUDINARY_CLOUD_NAME ||
      !config.CLOUDINARY_API_KEY ||
      !config.CLOUDINARY_API_SECRET
    ) {
      throw new Error(
        'STORAGE_PROVIDER=cloudinary exige CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY et CLOUDINARY_API_SECRET.',
      );
    }

    cached = new CloudinaryStorageProvider({
      cloudName: config.CLOUDINARY_CLOUD_NAME,
      apiKey: config.CLOUDINARY_API_KEY,
      apiSecret: config.CLOUDINARY_API_SECRET,
    });
    return cached;
  }

  if (config.APP_ENV === 'production') {
    throw new Error(
      'Le stockage local est interdit en production : les fichiers seraient perdus au redéploiement. ' +
        'Définissez STORAGE_PROVIDER=cloudinary.',
    );
  }

  cached = new LocalStorageProvider(localUploadRoot(), config.PUBLIC_BASE_URL);
  return cached;
}

/**
 * Racine du stockage local.
 *
 * Hors de `public/` : ce dossier n'est lu par Next qu'à la construction, un
 * fichier ajouté pendant l'exécution n'y serait pas servi. La route
 * `/api/files/...` lit ici directement.
 *
 * `UPLOAD_DIR` prime sur le chemin déduit, et doit être renseigné dès qu'un
 * volume est monté. Next modifie le répertoire de travail dans sa sortie
 * autonome : le chemin déduit devient alors `<racine>/backend/.uploads`, un
 * emplacement que personne n'a choisi et sur lequel aucun volume n'est monté.
 */
export function localUploadRoot(): string {
  return env().UPLOAD_DIR ?? join(process.cwd(), '.uploads');
}
