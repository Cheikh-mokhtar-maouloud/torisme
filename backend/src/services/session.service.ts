import { createHash, randomBytes } from 'node:crypto';

import { HttpError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { Session } from '@/models';

/**
 * Jetons de rafraîchissement.
 *
 * Sans eux, la session expirait au bout de 15 minutes et l'utilisateur était
 * déconnecté en pleine navigation — le défaut a été introduit en Phase 5 et se
 * corrige ici.
 */

/** 30 jours : durée usuelle pour une application mobile grand public. */
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Le jeton est haché avant stockage, comme un mot de passe.
 *
 * SHA-256 sans sel suffit ici, contrairement à un mot de passe : la valeur fait
 * 48 octets aléatoires, elle n'est ni devinable ni sujette aux tables
 * précalculées. Un bcrypt coûterait 250 ms à chaque rafraîchissement pour aucun
 * gain réel.
 */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface IssuedRefreshToken {
  token: string;
  expiresAt: Date;
}

export async function issueRefreshToken(
  userId: string,
  userAgent?: string,
): Promise<IssuedRefreshToken> {
  const token = randomBytes(48).toString('base64url');
  const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);

  await Session.create({
    userId,
    tokenHash: hashToken(token),
    expiresAt,
    ...(userAgent ? { userAgent: userAgent.slice(0, 300) } : {}),
  });

  return { token, expiresAt };
}

/**
 * Consomme un jeton de rafraîchissement et en émet un nouveau.
 *
 * La rotation est systématique : un jeton ne sert qu'une fois. Si un jeton déjà
 * consommé se représente, c'est qu'il a été volé — l'attaquant et la victime
 * détiennent la même valeur. On révoque alors **toutes** les sessions du compte
 * plutôt que d'arbitrer entre les deux.
 */
export async function rotateRefreshToken(
  token: string,
  userAgent?: string,
): Promise<{ userId: string; refresh: IssuedRefreshToken }> {
  const tokenHash = hashToken(token);
  const session = await Session.findOne({ tokenHash }).lean();

  if (!session) throw HttpError.unauthorized('Session invalide');

  if (session.revokedAt) throw HttpError.unauthorized('Session révoquée');

  if (session.usedAt) {
    logger.warn('réutilisation d’un jeton de rafraîchissement — sessions révoquées', {
      userId: String(session.userId),
    });
    await revokeAllSessions(String(session.userId));
    throw HttpError.unauthorized('Session compromise, reconnectez-vous');
  }

  if (session.expiresAt.getTime() < Date.now()) {
    throw HttpError.unauthorized('Session expirée');
  }

  // Marquage conditionné à `usedAt: null` : deux rafraîchissements simultanés
  // ne peuvent pas réussir tous les deux.
  const consumed = await Session.findOneAndUpdate(
    { tokenHash, usedAt: null, revokedAt: null },
    { $set: { usedAt: new Date() } },
  ).lean();

  if (!consumed) throw HttpError.unauthorized('Session invalide');

  const userId = String(session.userId);
  return { userId, refresh: await issueRefreshToken(userId, userAgent) };
}

export async function revokeSession(token: string): Promise<void> {
  await Session.updateOne({ tokenHash: hashToken(token) }, { $set: { revokedAt: new Date() } });
}

/**
 * Révoque toutes les sessions d'un compte.
 *
 * Appelée à la déconnexion globale, au changement de mot de passe et à la
 * détection d'un jeton rejoué : un mot de passe changé doit invalider les
 * sessions ouvertes ailleurs, sinon le changement ne protège de rien.
 */
export async function revokeAllSessions(userId: string): Promise<void> {
  await Session.updateMany({ userId, revokedAt: null }, { $set: { revokedAt: new Date() } });
}
