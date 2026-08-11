import { randomBytes } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import type { AllowedImageType } from '@tourism/shared/constants';

import { logger } from '../logger';
import { extensionFor } from './image-inspection';
import type { StorageProvider, StoredImage, UploadInput } from './types';

/**
 * Stockage sur disque, pour le développement.
 *
 * Les fichiers vont dans `backend/.uploads`, servis par la route
 * `/api/files/...`. Le dossier `public/` de Next ne convient pas : il n'est lu
 * qu'à la construction, si bien qu'un fichier téléversé pendant l'exécution
 * renvoie 404.
 *
 * Il permet de dérouler et de tester tout le parcours de téléversement sans
 * compte chez un fournisseur.
 *
 * Inutilisable en production : un système de fichiers serverless est éphémère
 * et non partagé entre instances. La fabrique refuse d'ailleurs de l'instancier
 * hors développement.
 */
export class LocalStorageProvider implements StorageProvider {
  readonly name = 'local';

  constructor(
    private readonly rootDirectory: string,
    private readonly publicBaseUrl: string,
  ) {}

  async upload(input: UploadInput): Promise<StoredImage> {
    const folder = sanitizeFolder(input.folder);
    const directory = join(this.rootDirectory, folder);
    await mkdir(directory, { recursive: true });

    // Nom entièrement généré : le nom fourni par le client n'est jamais
    // réutilisé, ce qui écarte d'un coup la traversée de répertoire et les
    // collisions entre téléversements simultanés.
    const fileName = `${Date.now()}-${randomBytes(8).toString('hex')}.${extensionFor(
      input.contentType as AllowedImageType,
    )}`;

    await writeFile(join(directory, fileName), input.data);

    const providerId = `${folder}/${fileName}`;

    return {
      url: `${this.publicBaseUrl}/api/files/${providerId}`,
      providerId,
      bytes: input.data.byteLength,
    };
  }

  async remove(providerId: string): Promise<void> {
    // `providerId` vient de la base, mais il a pu être écrit par une version
    // antérieure ou modifié à la main : on revérifie qu'il reste sous la racine.
    const target = resolve(this.rootDirectory, providerId);
    const root = resolve(this.rootDirectory);

    if (!target.startsWith(root)) {
      logger.warn('Suppression refusée : chemin hors du dossier de stockage', { providerId });
      return;
    }

    try {
      await unlink(target);
    } catch (error) {
      // Fichier déjà absent : l'état final voulu est atteint.
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
}

/** N'autorise que des dossiers simples en minuscules : aucune remontée possible. */
function sanitizeFolder(folder: string): string {
  const cleaned = folder.toLowerCase().replace(/[^a-z0-9-]/g, '');
  return cleaned || 'divers';
}
