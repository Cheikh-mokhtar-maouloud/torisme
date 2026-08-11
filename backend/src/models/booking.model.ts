import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose';

import { BookingStatus } from '@tourism/shared/constants';

import { baseSchemaOptions, currencyField } from './shared-schemas';

const bookingSchema = new Schema(
  {
    /** Référence lisible communiquée au client (« TP-8F3K2A »). */
    reference: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    hotelId: { type: Schema.Types.ObjectId, ref: 'Hotel', required: true, index: true },
    roomId: { type: Schema.Types.ObjectId, ref: 'Room', required: true, index: true },

    /**
     * Dates normalisées à minuit UTC. Sans cette normalisation, deux clients
     * dans des fuseaux différents produiraient des séjours de durées différentes
     * pour les mêmes jours calendaires, et le calcul de chevauchement deviendrait
     * dépendant de l'heure de saisie.
     */
    checkIn: { type: Date, required: true },
    checkOut: { type: Date, required: true },
    nights: { type: Number, required: true, min: 1 },
    guests: { type: Number, required: true, min: 1 },

    /**
     * Prix figé au moment de la réservation. Le relire depuis la chambre à
     * l'affichage ferait varier le montant d'une réservation passée à chaque
     * changement de tarif.
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

// Historique d'un utilisateur, du plus récent au plus ancien.
bookingSchema.index({ userId: 1, createdAt: -1 });
// Calcul de disponibilité : toutes les réservations actives d'une chambre qui
// chevauchent une période donnée.
bookingSchema.index({ roomId: 1, status: 1, checkIn: 1, checkOut: 1 });

export type BookingDocument = InferSchemaType<typeof bookingSchema>;

export const Booking: Model<BookingDocument> =
  (models.Booking as Model<BookingDocument>) ?? model<BookingDocument>('Booking', bookingSchema);
