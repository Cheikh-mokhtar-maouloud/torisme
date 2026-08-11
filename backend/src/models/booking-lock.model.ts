import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose';

/**
 * Verrou de réservation, portant sur une chambre.
 *
 * Il sérialise le couple « compter les chevauchements puis insérer » : sans
 * lui, deux requêtes simultanées peuvent toutes deux voir la dernière unité
 * libre et la réserver.
 *
 * Le mécanisme repose sur l'**index unique** de `roomId` : dans MongoDB, une
 * insertion violant un index unique échoue de façon atomique, y compris sur une
 * instance autonome. Aucune transaction, donc aucun replica set requis — ce qui
 * rend le comportement identique en développement et en production.
 *
 * L'index TTL sur `expiresAt` libère le verrou si le processus meurt entre la
 * prise et le relâchement. Sans lui, un plantage rendrait la chambre
 * définitivement non réservable.
 */
const bookingLockSchema = new Schema(
  {
    roomId: { type: Schema.Types.ObjectId, required: true, unique: true },
    expiresAt: { type: Date, required: true },
  },
  { versionKey: false },
);

/*
 * `expireAfterSeconds: 0` : MongoDB supprime le document dès que `expiresAt`
 * est dépassé. Le ramasse-miettes TTL ne passe que toutes les 60 secondes —
 * c'est un filet de sécurité contre les verrous orphelins, pas le mécanisme de
 * libération normal, qui reste la suppression explicite.
 */
bookingLockSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type BookingLockDocument = InferSchemaType<typeof bookingLockSchema>;

export const BookingLock: Model<BookingLockDocument> =
  (models.BookingLock as Model<BookingLockDocument>) ??
  model<BookingLockDocument>('BookingLock', bookingLockSchema);
