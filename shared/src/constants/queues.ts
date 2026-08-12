/**
 * Contrat des files d'attente.
 *
 * Partagé entre le backend qui dépose les tâches et le worker qui les
 * consomme. Un nom de file recopié des deux côtés finit par diverger, et la
 * panne qui en résulte est muette : le producteur écrit dans une file que
 * personne ne lit, sans la moindre erreur.
 */

export const QUEUE_NAMES = {
  /** Envoi d'emails transactionnels. */
  MAIL: 'mail',
  /** Rappels programmés (excursions à venir). */
  REMINDER: 'reminder',
  /** Entretien périodique : sessions expirées, verrous orphelins. */
  MAINTENANCE: 'maintenance',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export const JOB_NAMES = {
  SEND_MAIL: 'send-mail',
  EXCURSION_REMINDER: 'excursion-reminder',
  /**
   * Entretien périodique : fait avancer les statuts que seul le temps change
   * (séjours et excursions terminés). Ne purge rien — sessions et verrous ont
   * leurs propres index TTL côté MongoDB.
   */
  RUN_MAINTENANCE: 'run-maintenance',
} as const;

export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];

/**
 * Réglages de réessai, communs à toutes les files.
 *
 * Le délai est **exponentiel** : réessayer immédiatement un fournisseur
 * d'emails en surcharge ajoute à sa charge au pire moment, et les trois
 * tentatives seraient consommées en une seconde sans lui laisser le temps de
 * se rétablir.
 */
export const QUEUE_DEFAULTS = {
  attempts: 5,
  backoffDelayMs: 5_000,
  /**
   * Les tâches réussies sont conservées un temps, puis effacées. Sans
   * plafond, Redis accumule indéfiniment l'historique des tâches terminées et
   * finit par saturer sa mémoire.
   */
  removeOnCompleteCount: 200,
  /**
   * Les échecs définitifs sont gardés bien plus longtemps : ce sont eux qu'on
   * vient inspecter après un incident. Les effacer reviendrait à supprimer la
   * seule trace de ce qui n'est pas parti.
   */
  removeOnFailCount: 2_000,
} as const;
