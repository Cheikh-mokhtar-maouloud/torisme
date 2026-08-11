/**
 * Contrat de stockage de fichiers.
 *
 * Toute la plateforme passe par cette interface, jamais par un SDK de
 * fournisseur directement. Changer de Cloudinary vers S3 — ou l'inverse — doit
 * se limiter à écrire une implémentation et à changer une variable
 * d'environnement, sans toucher aux services ni aux routes.
 */

export interface StoredImage {
  /** URL publique de l'image. */
  url: string;
  /**
   * Identifiant chez le fournisseur (`public_id` Cloudinary, clé S3, nom de
   * fichier local). Indispensable à la suppression : une URL ne suffit pas
   * toujours à retrouver l'objet.
   */
  providerId: string;
  width?: number;
  height?: number;
  bytes: number;
}

export interface UploadInput {
  data: Buffer;
  /** Type MIME **vérifié d'après les octets**, pas d'après ce que déclare le client. */
  contentType: string;
  /**
   * Dossier logique (`hotels`, `rooms`…). Sert au rangement chez le
   * fournisseur ; il n'est jamais construit à partir d'une saisie utilisateur.
   */
  folder: string;
}

export interface StorageProvider {
  readonly name: string;
  upload(input: UploadInput): Promise<StoredImage>;
  /**
   * Supprime un fichier.
   *
   * L'absence du fichier n'est pas une erreur : supprimer deux fois, ou
   * supprimer une image déjà retirée à la main chez le fournisseur, doit
   * aboutir au même état final.
   */
  remove(providerId: string): Promise<void>;
}
