import { createHash, randomBytes } from 'node:crypto';

import { UserRole } from '@tourism/shared/constants';
import type { User as UserDto } from '@tourism/shared/types';
import type {
  ChangePasswordInput,
  LoginInput,
  RegisterInput,
  UpdateProfileInput,
} from '@tourism/shared/validation';

import { signAccessToken } from '@/lib/auth/jwt';
import { fakePasswordCheck, hashPassword, verifyPassword } from '@/lib/auth/password';
import { HttpError } from '@/lib/errors';
import { SecurityEvent, securityEvent } from '@/lib/security-log';
import { logger } from '@/lib/logger';
import { mailer } from '@/lib/mail';
import { passwordResetEmail, welcomeEmail } from '@/lib/mail/templates';
import { env } from '@/config/env';
import { serializeDocument } from '@/lib/serialize';
import { User } from '@/models';

import {
  issueRefreshToken,
  revokeAllSessions,
  revokeSession,
  rotateRefreshToken,
} from './session.service';

export interface AuthResult {
  user: UserDto;
  token: string;
  refreshToken: string;
}

/**
 * Verrouillage de compte.
 *
 * Cinq essais puis quinze minutes d'attente : assez pour rendre une attaque par
 * force brute impraticable, assez court pour qu'un utilisateur ayant oublié son
 * mot de passe ne soit pas bloqué durablement.
 */
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;

/** Durée de validité d'un lien de réinitialisation. */
const RESET_TTL_MS = 60 * 60 * 1000;

function hashResetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function register(input: RegisterInput, userAgent?: string): Promise<AuthResult> {
  const existing = await User.findOne({ email: input.email }).select('_id').lean();
  if (existing) {
    throw HttpError.conflict('Un compte existe déjà avec cet email');
  }

  const created = await User.create({
    fullName: input.fullName,
    email: input.email,
    passwordHash: await hashPassword(input.password),
    ...(input.phone ? { phone: input.phone } : {}),
    // Le rôle n'est jamais lu depuis l'entrée : une inscription publique ne peut
    // pas produire un administrateur, même si le client envoie `role: 'ADMIN'`.
    role: UserRole.USER,
  });

  const userId = String(created._id);

  // L'échec d'envoi ne doit pas faire échouer l'inscription : le compte existe,
  // l'utilisateur est connecté, seul le message de bienvenue manque.
  void sendQuietly(welcomeEmail(input.email, input.fullName));

  return {
    user: serializeDocument<UserDto>(created.toObject()),
    token: await signAccessToken({ sub: userId, role: UserRole.USER, email: input.email }),
    refreshToken: (await issueRefreshToken(userId, userAgent)).token,
  };
}

/**
 * Envoi d'email détaché.
 *
 * Les parcours d'authentification ne doivent jamais dépendre de la
 * disponibilité du serveur d'emails : l'échec est journalisé, pas propagé.
 */
async function sendQuietly(
  message: Parameters<ReturnType<typeof mailer>['send']>[0],
): Promise<void> {
  try {
    await mailer().send(message);
  } catch (error) {
    logger.error('email non envoyé', {
      subject: message.subject,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function login(input: LoginInput, userAgent?: string): Promise<AuthResult> {
  const found = await User.findOne({ email: input.email })
    .select('+passwordHash +failedLoginAttempts +lockedUntil')
    .lean();

  // Un email inexistant déclenche tout de même une comparaison bcrypt, afin que
  // les deux cas prennent le même temps et qu'on ne puisse pas énumérer les comptes.
  if (!found) {
    await fakePasswordCheck(input.password);
    throw HttpError.unauthorized('Email ou mot de passe incorrect');
  }

  if (found.lockedUntil && found.lockedUntil.getTime() > Date.now()) {
    const minutes = Math.ceil((found.lockedUntil.getTime() - Date.now()) / 60_000);
    throw HttpError.unauthorized(
      `Trop de tentatives. Réessayez dans ${minutes} minute${minutes > 1 ? 's' : ''}.`,
    );
  }

  const passwordMatches = await verifyPassword(input.password, found.passwordHash);

  if (!passwordMatches) {
    const attempts = (found.failedLoginAttempts ?? 0) + 1;
    securityEvent(SecurityEvent.LOGIN_FAILED, {
      userId: String(found._id),
      detail: `tentative ${attempts}`,
    });
    await registerFailedAttempt(String(found._id), attempts);
    throw HttpError.unauthorized('Email ou mot de passe incorrect');
  }

  if (!found.isActive) {
    throw HttpError.forbidden('Compte désactivé');
  }

  // Connexion réussie : le compteur repart de zéro, sinon des échecs éparpillés
  // dans le temps finiraient par verrouiller un utilisateur légitime.
  if (found.failedLoginAttempts) {
    await User.updateOne(
      { _id: found._id },
      { $set: { failedLoginAttempts: 0 }, $unset: { lockedUntil: '' } },
    );
  }

  const userId = String(found._id);

  return {
    user: serializeDocument<UserDto>(found),
    token: await signAccessToken({ sub: userId, role: found.role as UserRole, email: found.email }),
    refreshToken: (await issueRefreshToken(userId, userAgent)).token,
  };
}

async function registerFailedAttempt(userId: string, attempts: number): Promise<void> {
  const shouldLock = attempts >= MAX_FAILED_ATTEMPTS;

  await User.updateOne(
    { _id: userId },
    {
      $set: {
        failedLoginAttempts: attempts,
        ...(shouldLock ? { lockedUntil: new Date(Date.now() + LOCK_DURATION_MS) } : {}),
      },
    },
  );

  if (shouldLock) {
    securityEvent(SecurityEvent.ACCOUNT_LOCKED, { userId, detail: `${attempts} échecs` });
  }
}

/** Échange un jeton de rafraîchissement contre un nouveau couple de jetons. */
export async function refresh(refreshToken: string, userAgent?: string): Promise<AuthResult> {
  const { userId, refresh: rotated } = await rotateRefreshToken(refreshToken, userAgent);

  const user = await User.findById(userId).lean();
  if (!user) throw HttpError.unauthorized('Compte introuvable');
  if (!user.isActive) throw HttpError.forbidden('Compte désactivé');

  return {
    user: serializeDocument<UserDto>(user),
    token: await signAccessToken({
      sub: userId,
      role: user.role as UserRole,
      email: user.email,
    }),
    refreshToken: rotated.token,
  };
}

export async function logout(refreshToken?: string): Promise<void> {
  if (refreshToken) await revokeSession(refreshToken);
}

export async function getCurrentUser(userId: string): Promise<UserDto> {
  const found = await User.findById(userId).lean();
  if (!found) throw HttpError.notFound('Utilisateur introuvable');
  return serializeDocument<UserDto>(found);
}

export async function updateProfile(userId: string, input: UpdateProfileInput): Promise<UserDto> {
  const updated = await User.findByIdAndUpdate(
    userId,
    { $set: input },
    { new: true, runValidators: true },
  ).lean();

  if (!updated) throw HttpError.notFound('Utilisateur introuvable');
  return serializeDocument<UserDto>(updated);
}

/**
 * Change le mot de passe d'un utilisateur connecté.
 *
 * L'ancien mot de passe est exigé : sans lui, un jeton volé suffirait à
 * s'approprier le compte définitivement.
 */
export async function changePassword(userId: string, input: ChangePasswordInput): Promise<void> {
  const found = await User.findById(userId).select('+passwordHash').lean();
  if (!found) throw HttpError.notFound('Utilisateur introuvable');

  const matches = await verifyPassword(input.currentPassword, found.passwordHash);
  if (!matches) {
    throw HttpError.validation('Mot de passe actuel incorrect', {
      currentPassword: ['Mot de passe incorrect'],
    });
  }

  await User.updateOne(
    { _id: userId },
    { $set: { passwordHash: await hashPassword(input.newPassword) } },
  );

  // Un changement de mot de passe doit fermer les sessions ouvertes ailleurs,
  // sinon il ne protège de rien face à un appareil compromis.
  await revokeAllSessions(userId);
}

/**
 * Demande de réinitialisation.
 *
 * Renvoie toujours le même résultat, que l'email existe ou non : une réponse
 * différenciée permettrait d'énumérer les comptes enregistrés.
 *
 * Le jeton en clair est renvoyé à l'appelant pour que la couche d'envoi
 * l'inclue dans le message. Tant que les emails n'existent pas (Phase 11), la
 * route ne l'expose qu'en développement — voir le handler.
 */
export async function requestPasswordReset(email: string): Promise<string | null> {
  const found = await User.findOne({ email }).select('_id isActive').lean();

  if (!found || !found.isActive) {
    logger.info('réinitialisation demandée pour un compte inconnu ou inactif');
    return null;
  }

  const token = randomBytes(32).toString('base64url');

  await User.updateOne(
    { _id: found._id },
    {
      $set: {
        passwordResetTokenHash: hashResetToken(token),
        passwordResetExpiresAt: new Date(Date.now() + RESET_TTL_MS),
      },
    },
  );

  /*
   * Le lien pointe vers l'application publique, pas vers l'API : c'est une page
   * qui doit s'ouvrir dans un navigateur, avec un formulaire.
   *
   * Le jeton voyage en clair dans l'URL — c'est sa raison d'être — d'où sa durée
   * d'une heure et son usage unique.
   */
  const resetUrl = `${env().APP_PUBLIC_URL}/reset-password?token=${encodeURIComponent(token)}`;
  await sendQuietly(passwordResetEmail(email, resetUrl));

  return token;
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const found = await User.findOne({ passwordResetTokenHash: hashResetToken(token) })
    .select('+passwordResetExpiresAt')
    .lean();

  if (!found || !found.passwordResetExpiresAt) {
    throw HttpError.validation('Lien de réinitialisation invalide', {
      token: ['Ce lien n’est plus valide. Demandez-en un nouveau.'],
    });
  }

  if (found.passwordResetExpiresAt.getTime() < Date.now()) {
    throw HttpError.validation('Lien de réinitialisation expiré', {
      token: ['Ce lien a expiré. Demandez-en un nouveau.'],
    });
  }

  await User.updateOne(
    { _id: found._id },
    {
      $set: { passwordHash: await hashPassword(newPassword), failedLoginAttempts: 0 },
      // Usage unique : le jeton est effacé dès qu'il a servi.
      $unset: { passwordResetTokenHash: '', passwordResetExpiresAt: '', lockedUntil: '' },
    },
  );

  // Réinitialiser son mot de passe est aussi la manœuvre d'un utilisateur dont
  // le compte est compromis : toutes les sessions doivent tomber.
  await revokeAllSessions(String(found._id));
}
