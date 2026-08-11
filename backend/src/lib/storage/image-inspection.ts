import { UPLOAD, type AllowedImageType } from '@tourism/shared/constants';

import { HttpError } from '../errors';

/**
 * Inspection d'un fichier téléversé.
 *
 * Le type est déduit des **octets réels**, jamais de l'extension ni du
 * `Content-Type` déclaré par le client — l'un comme l'autre sont librement
 * choisis par l'appelant. Un exécutable renommé `photo.jpg` et annoncé comme
 * `image/jpeg` serait accepté par une vérification déclarative.
 */

interface ImageInfo {
  contentType: AllowedImageType;
  width: number | undefined;
  height: number | undefined;
}

export function inspectImage(data: Buffer): ImageInfo {
  if (data.byteLength === 0) {
    throw HttpError.validation('Fichier vide');
  }

  if (data.byteLength > UPLOAD.MAX_IMAGE_SIZE_BYTES) {
    const maxMegabytes = Math.round(UPLOAD.MAX_IMAGE_SIZE_BYTES / (1024 * 1024));
    throw HttpError.validation(`Image trop lourde (maximum ${maxMegabytes} Mo)`, {
      file: [`La taille maximale est de ${maxMegabytes} Mo`],
    });
  }

  const jpeg = readJpeg(data);
  if (jpeg) return jpeg;

  const png = readPng(data);
  if (png) return png;

  const webp = readWebp(data);
  if (webp) return webp;

  throw HttpError.validation('Format non pris en charge', {
    file: ['Formats acceptés : JPEG, PNG et WebP'],
  });
}

/**
 * JPEG : commence par `FF D8 FF`.
 *
 * Les dimensions se lisent dans le marqueur SOF (`FFC0`–`FFCF`, hors `FFC4`,
 * `FFC8` et `FFCC` qui ont un autre sens). Il faut parcourir les segments : la
 * position du SOF varie selon les métadonnées présentes.
 */
function readJpeg(data: Buffer): ImageInfo | null {
  if (data.byteLength < 4) return null;
  if (data[0] !== 0xff || data[1] !== 0xd8 || data[2] !== 0xff) return null;

  let offset = 2;

  while (offset + 9 < data.byteLength) {
    if (data[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = data[offset + 1]!;
    const isStartOfFrame =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

    if (isStartOfFrame) {
      return {
        contentType: 'image/jpeg',
        height: data.readUInt16BE(offset + 5),
        width: data.readUInt16BE(offset + 7),
      };
    }

    const segmentLength = data.readUInt16BE(offset + 2);
    if (segmentLength < 2) break;
    offset += 2 + segmentLength;
  }

  // Signature valide mais dimensions illisibles : le fichier reste acceptable,
  // les dimensions sont facultatives.
  return { contentType: 'image/jpeg', width: undefined, height: undefined };
}

/** PNG : signature de 8 octets, puis un bloc IHDR contenant largeur et hauteur. */
function readPng(data: Buffer): ImageInfo | null {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (data.byteLength < 24) return null;
  if (!signature.every((byte, index) => data[index] === byte)) return null;

  return {
    contentType: 'image/png',
    width: data.readUInt32BE(16),
    height: data.readUInt32BE(20),
  };
}

/**
 * WebP : conteneur RIFF (`RIFF....WEBP`).
 *
 * Trois variantes coexistent — VP8 (avec perte), VP8L (sans perte) et VP8X
 * (étendu) — et chacune encode ses dimensions différemment.
 */
function readWebp(data: Buffer): ImageInfo | null {
  if (data.byteLength < 30) return null;
  if (data.toString('ascii', 0, 4) !== 'RIFF') return null;
  if (data.toString('ascii', 8, 12) !== 'WEBP') return null;

  const format = data.toString('ascii', 12, 16);

  if (format === 'VP8 ') {
    return {
      contentType: 'image/webp',
      width: data.readUInt16LE(26) & 0x3fff,
      height: data.readUInt16LE(28) & 0x3fff,
    };
  }

  if (format === 'VP8L') {
    const bits = data.readUInt32LE(21);
    return {
      contentType: 'image/webp',
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    };
  }

  if (format === 'VP8X') {
    // Dimensions sur 24 bits, stockées diminuées de 1.
    const width = 1 + (data[24]! | (data[25]! << 8) | (data[26]! << 16));
    const height = 1 + (data[27]! | (data[28]! << 8) | (data[29]! << 16));
    return { contentType: 'image/webp', width, height };
  }

  return { contentType: 'image/webp', width: undefined, height: undefined };
}

/** Extension canonique d'un type accepté, pour nommer le fichier stocké. */
export function extensionFor(contentType: AllowedImageType): string {
  if (contentType === 'image/png') return 'png';
  if (contentType === 'image/webp') return 'webp';
  return 'jpg';
}
