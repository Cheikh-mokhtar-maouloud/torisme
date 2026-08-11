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
