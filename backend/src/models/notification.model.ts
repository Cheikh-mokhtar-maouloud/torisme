import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose';

import { NotificationType } from '@tourism/shared/constants';

import { baseSchemaOptions } from './shared-schemas';

const notificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: Object.values(NotificationType), required: true },
    title: { type: String, required: true, maxlength: 160 },
    body: { type: String, required: true, maxlength: 1000 },

    /**
     * Charge utile de navigation : `{ bookingId }`, `{ excursionId }`…
     * Uniquement des chaînes, pour rester sérialisable et permettre au mobile de
     * construire un lien profond sans connaître la forme du document.
     */
    data: { type: Map, of: String, default: undefined },

    readAt: { type: Date },
  },
  baseSchemaOptions,
);

// Boîte de réception : les plus récentes d'abord.
notificationSchema.index({ userId: 1, createdAt: -1 });
// Compteur de non-lues, interrogé à chaque ouverture de l'application.
notificationSchema.index({ userId: 1, readAt: 1 });

export type NotificationDocument = InferSchemaType<typeof notificationSchema>;

export const Notification: Model<NotificationDocument> =
  (models.Notification as Model<NotificationDocument>) ??
  model<NotificationDocument>('Notification', notificationSchema);
