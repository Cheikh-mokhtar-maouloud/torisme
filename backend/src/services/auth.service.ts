import { createHash, createHmac, randomBytes, randomInt } from 'node:crypto';

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
import { emailVerificationEmail, passwordResetEmail, welcomeEmail } from '@/lib/mail/templates';
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
 * Résultat d'une inscription.
 *
 * Volontairement sans jeton : l'adresse n'est pas encore vérifiée, donc aucune
 * session n'est ouverte. Seule l'adresse est renvoyée, pour que l'écran suivant
 * puisse la pré-remplir sans la redemander.
 */
export interface RegistrationResult {
  email: string;
  verificationRequired: true;
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

export async function register(input: RegisterInput): Promise<RegistrationResult> {
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

  /*
   * L'inscription **n'ouvre plus de session**.
   *
   * Tant que l'adresse n'est pas vérifiée, rien ne prouve qu'elle appartient à
   * la personne qui vient de s'inscrire. Connecter d'emblée reviendrait à
   * donner un compte — et l'accès aux réservations qui y seront faites — à qui
   * saisit l'adresse d'un autre.
   *
   * Le parcours devient : inscription, code, connexion. C'est un aller-retour
   * de plus, assumé : il rend l'adresse fiable, ce dont dépend toute la suite —
   * confirmation de réservation, réinitialisation de mot de passe.
   */
  await issueEmailVerificationCode(userId, input.email);

  return { email: input.email, verificationRequired: true };
}

/** Durée de vie d'un code de vérification. */
const EMAIL_CODE_TTL_MS = 15 * 60 * 1000;

/**
 * Nombre d'essais avant invalidation du code.
 *
 * Six chiffres font un million de combinaisons. Sans plafond, un script les
 * épuise en quelques minutes ; avec cinq essais, la probabilité de tomber juste
 * est de cinq sur un million, et l'attaquant doit redemander un code — donc
 * passer par la boîte de la victime.
 */
const MAX_EMAIL_CODE_ATTEMPTS = 5;

/**
 * Empreinte d'un code, **avec un secret du serveur**.
 *
 * Un simple SHA-256 ne protégerait rien : six chiffres font un million de
 * combinaisons, et les parcourir toutes pour retrouver l'empreinte prend
 * quelques secondes. C'est vérifié, pas supposé — le code d'un compte d'essai a
 * été retrouvé ainsi à partir de sa seule empreinte.
 *
 * L'HMAC change la donne : sans le secret, l'attaquant ne peut pas calculer les
 * empreintes candidates. Une copie de la base ne suffit donc plus, il lui faut
 * aussi la configuration du serveur.
 *
 * Le secret dérive de `JWT_SECRET` avec un préfixe de domaine. Ce préfixe n'est
 * pas cosmétique : sans lui, la même clé servirait à deux usages, et une
 * faiblesse trouvée sur l'un affaiblirait l'autre.
 */
function hashEmailCode(code: string): string {
  return createHmac('sha256', `email-verification:${env().JWT_SECRET}`).update(code).digest('hex');
}

/**
 * Génère un code, l'enregistre haché, et l'envoie.
 *
 * `randomInt` et non `Math.random` : ce dernier est prévisible à partir de
 * quelques tirages, ce qui suffirait à deviner le code d'un autre compte.
 */
async function issueEmailVerificationCode(userId: string, email: string): Promise<void> {
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');

  await User.updateOne(
    { _id: userId },
    {
      $set: {
        emailVerificationCodeHash: hashEmailCode(code),
        emailVerificationExpiresAt: new Date(Date.now() + EMAIL_CODE_TTL_MS),
        emailVerificationAttempts: 0,
      },
    },
  );

  void sendQuietly(emailVerificationEmail(email, code, EMAIL_CODE_TTL_MS / 60_000));
}

/**
 * Vérifie un code et marque l'adresse comme confirmée.
 *
 * Ne rend **pas** de session : l'utilisateur est ensuite dirigé vers la
 * connexion. Ouvrir une session ici ferait de la vérification une seconde
 * porte d'entrée, avec un secret à six chiffres — bien plus faible qu'un mot
 * de passe.
 */
export async function verifyEmail(email: string, code: string): Promise<void> {
  const found = await User.findOne({ email })
    .select('+emailVerificationCodeHash +emailVerificationExpiresAt +emailVerificationAttempts')
    .lean();

  const invalid = () =>
    HttpError.validation('Code invalide ou expiré', {
      code: ['Ce code est invalide ou a expiré. Demandez-en un nouveau.'],
    });

  // Un compte inexistant et un code faux renvoient la même erreur : distinguer
  // les deux permettrait d'énumérer les adresses inscrites.
  if (!found || !found.emailVerificationCodeHash || !found.emailVerificationExpiresAt) {
    throw invalid();
  }

  if (found.emailVerifiedAt) {
    // Déjà vérifiée : ce n'est pas une erreur, c'est un second appui sur le
    // bouton. Le dire évite de faire chercher un code qui ne sert plus.
    return;
  }

  if (found.emailVerificationExpiresAt.getTime() < Date.now()) throw invalid();

  if ((found.emailVerificationAttempts ?? 0) >= MAX_EMAIL_CODE_ATTEMPTS) {
    throw HttpError.validation('Trop de tentatives', {
      code: ['Trop d’essais. Demandez un nouveau code.'],
    });
  }

  if (found.emailVerificationCodeHash !== hashEmailCode(code)) {
    await User.updateOne({ _id: found._id }, { $inc: { emailVerificationAttempts: 1 } });
    throw invalid();
  }

  await User.updateOne(
    { _id: found._id },
    {
      $set: { emailVerifiedAt: new Date() },
      // Le code est effacé, pas conservé : un code utilisé ne doit jamais
      // resservir, même dans sa fenêtre de validité.
      $unset: {
        emailVerificationCodeHash: '',
        emailVerificationExpiresAt: '',
        emailVerificationAttempts: '',
      },
    },
  );

  void sendQuietly(welcomeEmail(email, found.fullName));
}

/**
 * Renvoie un code.
 *
 * Ne dit jamais si l'adresse existe : la réponse est identique dans tous les
 * cas. Sans cela, ce point d'entrée deviendrait un moyen de tester des adresses
 * en masse.
 */
export async function resendEmailVerification(email: string): Promise<void> {
  const found = await User.findOne({ email }).select('_id emailVerifiedAt').lean();

  if (!found || found.emailVerifiedAt) return;

  await issueEmailVerificationCode(String(found._id), email);
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

  /*
   * Compte créé par Google : il n'a pas de mot de passe.
   *
   * Le message nomme la voie à suivre plutôt que de répéter « email ou mot de
   * passe incorrect » : ici l'adresse est bonne, et laisser l'utilisateur
   * ressayer son mot de passe indéfiniment ne l'aiderait pas. Cela ne révèle
   * rien d'exploitable — il faut déjà connaître une adresse inscrite, et
   * l'attaquant apprendrait de toute façon en tentant le bouton Google.
   */
  if (!found.passwordHash) {
    throw HttpError.unauthorized(
      'Ce compte utilise la connexion Google. Utilisez le bouton « Continuer avec Google ».',
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

  /*
   * Adresse non vérifiée : la connexion est refusée.
   *
   * Sans ce contrôle, tout le parcours de vérification serait décoratif — il
   * suffirait d'ignorer le code et de se connecter avec le mot de passe choisi
   * à l'inscription.
   *
   * Le contrôle vient **après** la vérification du mot de passe : l'annoncer
   * avant révélerait à qui saisit une adresse au hasard qu'un compte existe et
   * qu'il n'est pas vérifié.
   *
   * Les comptes antérieurs à cette règle n'ont pas de date de vérification. Ils
   * sont repris par backfill-email-verified.mjs, sans quoi ils seraient tous
   * bloqués au déploiement.
   */
  if (!found.emailVerifiedAt) {
    throw HttpError.forbidden(
      'Adresse non vérifiée. Saisissez le code reçu par courriel pour activer votre compte.',
    );
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

/**
 * Connexion par Google.
 *
 * ─── Ce que le serveur vérifie, et pourquoi ─────────────────────────────────
 *
 * L'application envoie le **jeton d'identité** émis par Google, non une adresse
 * électronique. La différence est tout : une adresse est déclarative, un jeton
 * est signé. Accepter « connecte-moi comme untel@gmail.com » sur parole
 * laisserait n'importe qui prendre le compte de n'importe qui.
 *
 * `verifyIdToken` contrôle la signature contre les clés publiques de Google, la
 * date d'expiration, et surtout l'**audience** : le jeton doit avoir été émis
 * pour notre application. Sans ce dernier contrôle, un jeton obtenu par une
 * autre application Google — n'importe laquelle — serait accepté ici.
 *
 * ─── Rattachement d'un compte existant ──────────────────────────────────────
 *
 * Une adresse déjà inscrite par mot de passe se voit rattacher l'identité
 * Google plutôt que refuser la connexion. L'inverse obligerait quelqu'un ayant
 * créé son compte au clavier à ne plus jamais pouvoir utiliser le bouton
 * Google, sans comprendre pourquoi.
 *
 * Google n'est cru que si l'adresse est marquée vérifiée par lui : sans cette
 * condition, un compte Google créé avec l'adresse d'autrui — Google n'exige pas
 * toujours la vérification — permettrait de s'emparer du compte correspondant.
 */
export async function loginWithGoogle(idToken: string, userAgent?: string): Promise<AuthResult> {
  const googleClientId = env().GOOGLE_CLIENT_ID;

  if (!googleClientId) {
    throw HttpError.validation('La connexion Google n’est pas configurée sur ce serveur.');
  }

  const { OAuth2Client } = await import('google-auth-library');
  const client = new OAuth2Client(googleClientId);

  let payload;

  try {
    const ticket = await client.verifyIdToken({
      idToken,
      audience: googleClientId,
    });
    payload = ticket.getPayload();
  } catch {
    // Le détail de l'échec n'est pas remonté : signature invalide, jeton
    // expiré ou audience étrangère sont tous des tentatives à traiter de la
    // même façon, et les distinguer renseignerait un attaquant.
    securityEvent(SecurityEvent.LOGIN_FAILED, { detail: 'jeton Google refusé' });
    throw HttpError.unauthorized('Connexion Google refusée');
  }

  if (!payload?.sub || !payload.email) {
    throw HttpError.unauthorized('Connexion Google refusée');
  }

  const email = payload.email.toLowerCase();

  const existing = await User.findOne({ $or: [{ googleId: payload.sub }, { email }] })
    .select('+googleId')
    .lean();

  if (existing) {
    if (!existing.isActive) throw HttpError.forbidden('Compte désactivé');

    // Rattachement : voir la note d'en-tête sur `email_verified`.
    if (!existing.googleId) {
      if (!payload.email_verified) {
        throw HttpError.unauthorized(
          'Cette adresse est déjà utilisée. Connectez-vous avec votre mot de passe.',
        );
      }
      await User.updateOne({ _id: existing._id }, { $set: { googleId: payload.sub } });
    }

    const userId = String(existing._id);

    return {
      user: serializeDocument<UserDto>(existing),
      token: await signAccessToken({
        sub: userId,
        role: existing.role as UserRole,
        email: existing.email,
      }),
      refreshToken: (await issueRefreshToken(userId, userAgent)).token,
    };
  }

  const created = await User.create({
    fullName: payload.name?.trim() || email.split('@')[0],
    email,
    googleId: payload.sub,
    ...(payload.picture ? { avatarUrl: payload.picture } : {}),
    role: UserRole.USER,
  });

  const userId = String(created._id);

  return {
    user: serializeDocument<UserDto>(created.toObject()),
    token: await signAccessToken({ sub: userId, role: UserRole.USER, email }),
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

  // Même raison que dans `login` : un compte Google n'a pas d'ancien mot de
  // passe à confirmer. Il lui faudrait passer par « mot de passe oublié », qui
  // en définit un premier sans en exiger un précédent.
  if (!found.passwordHash) {
    throw HttpError.validation(
      'Ce compte utilise la connexion Google. Définissez un mot de passe via « mot de passe oublié ».',
    );
  }

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
