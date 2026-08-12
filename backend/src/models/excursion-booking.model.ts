import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose';

import { BookingStatus } from '@tourism/shared/constants';

import { baseSchemaOptions, currencyField } from './shared-schemas';

const excursionBookingSchema = new Schema(
  {
    reference: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    excursionId: { type: Schema.Types.ObjectId, ref: 'Excursion', required: true, index: true },

    seats: { type: Number, required: true, min: 1 },

    /**
     * Prix figé au moment de la réservation, comme pour l'hébergement : relire
     * le tarif de l'excursion à l'affichage ferait varier le montant d'une
     * réservation passée à chaque changement de prix.
     */
    unitPrice: { type: Number, required: true, min: 0 },
    totalPrice: { type: Number, required: true, min: 0 },
    currency: currencyField,

    status: {
      type: String,
      enum: Object.values(BookingStatus),
      default: BookingStatus.PENDING,
      index: true,
    },
    cancelledAt: { type: Date },
    cancellationReason: { type: String, maxlength: 500 },

    /**
     * Horodatage du rappel envoyé avant le départ.
     *
     * Ce champ **est** le garde-fou d'idempotence : le worker le pose par une
     * mise à jour conditionnelle, si bien qu'un rappel rejoué — réessai BullMQ,
     * worker redémarré, deux instances en parallèle — ne trouve plus la
     * condition remplie et n'envoie rien. Se fier au seul « une tâche, une
     * exécution » de la file serait une erreur : une file garantit *au moins*
     * une livraison, pas exactement une.
     */
    reminderSentAt: { type: Date },
  },
  baseSchemaOptions,
);

// Historique d'un client, du plus récent au plus ancien.
excursionBookingSchema.index({ userId: 1, createdAt: -1 });
// Liste des participants d'une excursion, pour l'administration.
excursionBookingSchema.index({ excursionId: 1, status: 1 });

export type ExcursionBookingDocument = InferSchemaType<typeof excursionBookingSchema>;

export const ExcursionBooking: Model<ExcursionBookingDocument> =
  (models.ExcursionBooking as Model<ExcursionBookingDocument>) ??
  model<ExcursionBookingDocument>('ExcursionBooking', excursionBookingSchema);
