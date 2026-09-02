import { z } from 'zod';

import { emailSchema, passwordSchema, phoneSchema } from './primitives';

export const registerSchema = z.object({
  fullName: z.string().trim().min(2, 'Nom trop court').max(100),
  email: emailSchema,
  password: passwordSchema,
  phone: phoneSchema.optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  // Pas de contrainte de longueur à la connexion : les règles peuvent évoluer
  // et un compte existant ne doit jamais être bloqué par une validation client.
  password: z.string().min(1, 'Mot de passe requis'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(16, 'Jeton invalide'),
  password: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const updateProfileSchema = z.object({
  fullName: z.string().trim().min(2).max(100).optional(),
  phone: phoneSchema.optional(),
  avatarUrl: z.url().optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/**
 * Connexion par Google.
 *
 * Un seul champ : le jeton d'identité. Ni adresse ni nom — ils sont dans le
 * jeton, signés par Google. Les accepter séparément reviendrait à croire le
 * client sur des données qu'il pourrait choisir.
 */
export const googleAuthSchema = z.object({
  idToken: z.string().min(20),
});
export type GoogleAuthInput = z.infer<typeof googleAuthSchema>;

/**
 * Vérification de l'adresse par code.
 *
 * Six chiffres exactement, et uniquement des chiffres : le contrôle rejette
 * avant toute requête à la base ce qui ne peut de toute façon pas être un code.
 */
export const verifyEmailSchema = z.object({
  email: z.email().toLowerCase().trim(),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Le code comporte six chiffres'),
});
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

export const resendVerificationSchema = z.object({
  email: z.email().toLowerCase().trim(),
});
export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;
