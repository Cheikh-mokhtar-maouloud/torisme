import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose';

/**
 * Session de rafraîchissement.
 *
 * Le jeton d'accès dure 15 minutes et n'est pas révocable — c'est le prix de sa
 * vérification purement cryptographique, sans aller-retour en base. Le jeton de
 * rafraîchissement, lui, est stocké : il peut donc être révoqué immédiatement,
 * à la déconnexion comme lors d'un changement de mot de passe.
 *
 * Seul un **hachage** du jeton est conservé. Une fuite de la base ne livrerait
 * alors aucune session utilisable, exactement comme pour les mots de passe.
 */
const sessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    /** SHA-256 du jeton. Le jeton en clair n'existe que chez le client. */
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    /**
     * Marquage de rotation : un jeton de rafraîchissement ne sert qu'une fois.
     * Le voir réutilisé signale un vol, et déclenche la révocation de toutes les
     * sessions du compte.
     */
    usedAt: { type: Date },
    revokedAt: { type: Date },
    /** Contexte de connexion, utile au support et à la détection d'anomalies. */
    userAgent: { type: String, maxlength: 300 },
  },
  { timestamps: true, versionKey: false },
);

// Purge automatique des sessions expirées : sans elle, la collection ne ferait
// que croître avec des documents devenus inutiles.
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type SessionDocument = InferSchemaType<typeof sessionSchema>;

export const Session: Model<SessionDocument> =
  (models.Session as Model<SessionDocument>) ?? model<SessionDocument>('Session', sessionSchema);
