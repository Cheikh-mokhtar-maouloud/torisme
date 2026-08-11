import { createHash } from 'node:crypto';

import { logger } from '../logger';
import type { StorageProvider, StoredImage, UploadInput } from './types';

interface CloudinaryConfig {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

interface CloudinaryUploadResponse {
  secure_url: string;
  public_id: string;
  width?: number;
  height?: number;
  bytes?: number;
  error?: { message: string };
}

/**
 * Stockage Cloudinary.
 *
 * L'API HTTP est appelée directement, sans le SDK `cloudinary` : les deux
 * opérations nécessaires — téléverser, supprimer — tiennent en quelques lignes,
 * là où le SDK ajoute une dépendance lourde qui embarque son propre client HTTP
 * et des utilitaires inutilisés ici.
 *
 * Les transformations à la volée sont demandées dans l'URL de livraison plutôt
 * qu'appliquées au téléversement : l'original reste intact, et les formats
 * dérivés peuvent évoluer sans retéléverser quoi que ce soit.
 */
export class CloudinaryStorageProvider implements StorageProvider {
  readonly name = 'cloudinary';

  constructor(private readonly config: CloudinaryConfig) {}

  async upload(input: UploadInput): Promise<StoredImage> {
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = `tourism/${input.folder}`;

    /*
     * Signature Cloudinary : les paramètres signés, triés par nom, concaténés
     * puis hachés en SHA-1 avec le secret. Le secret ne quitte jamais le
     * serveur — c'est précisément ce qui rend l'opération sûre.
     */
    const signedParams = { folder, timestamp: String(timestamp) };
    const signature = this.sign(signedParams);

    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(input.data)], { type: input.contentType }));
    form.append('api_key', this.config.apiKey);
    form.append('timestamp', String(timestamp));
    form.append('folder', folder);
    form.append('signature', signature);

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${this.config.cloudName}/image/upload`,
      { method: 'POST', body: form },
    );

    const payload = (await response.json()) as CloudinaryUploadResponse;

    if (!response.ok || !payload.secure_url) {
      logger.error('Échec du téléversement Cloudinary', {
        status: response.status,
        cloudinaryMessage: payload.error?.message,
      });
      throw new Error(payload.error?.message ?? 'Téléversement refusé par le fournisseur');
    }

    return {
      url: payload.secure_url,
      providerId: payload.public_id,
      ...(payload.width ? { width: payload.width } : {}),
      ...(payload.height ? { height: payload.height } : {}),
      bytes: payload.bytes ?? input.data.byteLength,
    };
  }

  async remove(providerId: string): Promise<void> {
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = this.sign({ public_id: providerId, timestamp: String(timestamp) });

    const form = new FormData();
    form.append('public_id', providerId);
    form.append('api_key', this.config.apiKey);
    form.append('timestamp', String(timestamp));
    form.append('signature', signature);

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${this.config.cloudName}/image/destroy`,
      { method: 'POST', body: form },
    );

    if (!response.ok) {
      // Une suppression ratée laisse un fichier orphelin, pas une incohérence
      // visible : on journalise sans faire échouer l'opération métier, qui est
      // de retirer l'image de la fiche.
      logger.warn('Suppression Cloudinary sans succès', { providerId, status: response.status });
    }
  }

  private sign(params: Record<string, string>): string {
    const payload = Object.keys(params)
      .sort()
      .map((key) => `${key}=${params[key]}`)
      .join('&');

    return createHash('sha1')
      .update(payload + this.config.apiSecret)
      .digest('hex');
  }
}
