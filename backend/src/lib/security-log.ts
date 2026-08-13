import { logger } from './logger';

/**
 * Journal des événements de sécurité.
 *
 * Distinct des journaux applicatifs, et pour une raison pratique : ces
 * événements sont ceux sur lesquels on veut **alerter**. Noyés parmi les
 * `logger.warn` ordinaires — un champ mal rempli, une page introuvable — ils
 * exigeraient de reconnaître à l'œil ce qui relève d'une attaque. Un champ
 * `securityEvent` dédié rend la règle d'alerte triviale à écrire, et surtout
 * fiable dans le temps.
 *
 * Ce qui est enregistré est délibérément limité : jamais de mot de passe, de
 * jeton ni de contenu de requête. La rédaction du `logger` couvre déjà les noms
 * de champs sensibles, mais s'en remettre à elle serait une deuxième ligne, pas
 * la première.
 */

export const SecurityEvent = {
  /** Identifiants refusés. Une rafale sur un même compte signale une attaque. */
  LOGIN_FAILED: 'login_failed',
  /** Compte verrouillé après trop d'échecs. */
  ACCOUNT_LOCKED: 'account_locked',
  /** Quota de débit dépassé. */
  RATE_LIMITED: 'rate_limited',
  /** Appel à `/api/internal/*` sans secret valide. */
  INTERNAL_CALL_REJECTED: 'internal_call_rejected',
  /** Accès refusé faute de rôle suffisant. */
  FORBIDDEN: 'forbidden',
  /** Rôle ou activation d'un compte modifié par un administrateur. */
  PRIVILEGE_CHANGED: 'privilege_changed',
  /** Jeton de rafraîchissement réutilisé après rotation : vol probable. */
  REFRESH_REPLAY: 'refresh_replay',
} as const;

export type SecurityEvent = (typeof SecurityEvent)[keyof typeof SecurityEvent];

/**
 * Gravité par événement.
 *
 * Un échec de connexion isolé est banal — c'est un utilisateur qui se trompe ;
 * seule sa répétition compte, et c'est le rôle de l'agrégateur de la détecter.
 * Un rejeu de jeton de rafraîchissement, en revanche, n'a **aucune explication
 * innocente** : il signifie qu'un jeton a été copié. Les mettre au même niveau
 * ferait passer le second inaperçu au milieu des premiers.
 */
const SEVERITY: Record<SecurityEvent, 'warn' | 'error'> = {
  [SecurityEvent.LOGIN_FAILED]: 'warn',
  [SecurityEvent.ACCOUNT_LOCKED]: 'warn',
  [SecurityEvent.RATE_LIMITED]: 'warn',
  [SecurityEvent.INTERNAL_CALL_REJECTED]: 'error',
  [SecurityEvent.FORBIDDEN]: 'warn',
  [SecurityEvent.PRIVILEGE_CHANGED]: 'error',
  [SecurityEvent.REFRESH_REPLAY]: 'error',
};

export interface SecurityContext {
  /** Compte concerné, quand il est connu. */
  userId?: string;
  /** Adresse de l'appelant. */
  ip?: string;
  path?: string;
  /** Détail non sensible : nombre de tentatives, rôle visé, motif. */
  detail?: string;
}

export function securityEvent(event: SecurityEvent, context: SecurityContext = {}): void {
  const level = SEVERITY[event];

  logger[level]('événement de sécurité', {
    securityEvent: event,
    ...context,
  });
}

/**
 * Adresse de l'appelant, pour la journalisation uniquement.
 *
 * Volontairement séparée de `clientIdentifier` de la limitation de débit : là,
 * l'identifiant doit être infalsifiable pour que le quota ait un sens ; ici, il
 * ne sert qu'à enquêter, et une adresse approximative reste plus utile
 * qu'aucune.
 */
export function callerIp(request: { headers: Headers }): string | undefined {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim();
  return request.headers.get('x-real-ip') ?? undefined;
}
