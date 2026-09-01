import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose';

import { UserRole } from '@tourism/shared/constants';

import { baseSchemaOptions } from './shared-schemas';

const userSchema = new Schema(
  {
    fullName: { type: String, required: true, trim: true, maxlength: 100 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    /**
     * Hash bcrypt. `select: false` exclut le champ de toute requête par défaut :
     * il faut le demander explicitement (`.select('+passwordHash')`), ce qui rend
     * impossible une fuite par oubli dans une réponse d'API.
     */
    /*
     * Obligatoire **sauf** pour un compte créé par un fournisseur externe.
     *
     * Un utilisateur venu de Google n'a jamais choisi de mot de passe chez
     * nous ; lui en générer un au hasard donnerait un compte dont personne ne
     * connaît la clé, et que le formulaire « changer le mot de passe »
     * refuserait, faute d'ancien mot de passe à confirmer.
     *
     * La fonction est évaluée sur le document : le champ n'est exigé que si
     * aucune identité externe n'est rattachée.
     */
    passwordHash: {
      type: String,
      required(this: { googleId?: string }) {
        return !this.googleId;
      },
      select: false,
    },
    /**
     * Identifiant Google (« sub » du jeton), s'il y en a un.
     *
     * `sparse` est indispensable avec `unique` : sans lui, tous les comptes
     * sans identité Google porteraient la même valeur nulle et le second
     * enregistrement serait rejeté comme doublon.
     *
     * Le « sub » et non l'adresse électronique : Google garantit sa stabilité,
     * alors qu'une adresse peut changer de main.
     */
    googleId: { type: String, unique: true, sparse: true, select: false },
    phone: { type: String, trim: true },
    avatarUrl: { type: String },
    role: {
      type: String,
      enum: Object.values(UserRole),
      default: UserRole.USER,
      index: true,
    },
    isActive: { type: Boolean, default: true, index: true },
    emailVerifiedAt: { type: Date },

    /**
     * Réinitialisation de mot de passe.
     *
     * Le jeton est stocké **haché** : une fuite de la base ne permettrait pas de
     * prendre la main sur les comptes en attente de réinitialisation. Il est à
     * usage unique et de courte durée.
     */
    passwordResetTokenHash: { type: String, select: false },
    passwordResetExpiresAt: { type: Date, select: false },

    /**
     * Verrouillage après échecs répétés.
     *
     * Le compteur ralentit une attaque par force brute ciblée, que la limitation
     * de débit par IP (Phase 14) ne couvre pas : un attaquant distribué change
     * d'adresse mais vise toujours le même compte.
     */
    failedLoginAttempts: { type: Number, default: 0, select: false },
    lockedUntil: { type: Date, select: false },
  },
  {
    ...baseSchemaOptions,
    toJSON: {
      ...baseSchemaOptions.toJSON,
      transform(_doc, ret: Record<string, unknown>) {
        ret.id = String(ret._id);
        delete ret._id;
        // Ceinture et bretelles : même si une requête demande le hash,
        // il ne peut pas ressortir par la sérialisation JSON.
        delete ret.passwordHash;
        delete ret.googleId;
        return ret;
      },
    },
  },
);

export type UserDocument = InferSchemaType<typeof userSchema>;

/**
 * `models.User ?? model(...)` : en développement, Next réévalue ce module à
 * chaque rechargement. Sans cette garde, Mongoose lèverait
 * `OverwriteModelError` au second passage.
 */
export const User: Model<UserDocument> =
  (models.User as Model<UserDocument>) ?? model<UserDocument>('User', userSchema);
