import { Queue } from 'bullmq';

import { JOB_NAMES, QUEUE_DEFAULTS, QUEUE_NAMES, type QueueName } from '@tourism/shared/constants';
import type { ExcursionReminderJob, SendMailJob } from '@tourism/shared/validation';

import { env } from '@/config/env';

import { logger } from './logger';
import { redisOptions } from './redis';

/**
 * Dépôt de tâches.
 *
 * `notify()` promettait depuis la Phase 9 que la livraison durable arriverait
 * ici. Le problème qu'elle résout : un envoi d'email exécuté dans la requête
 * HTTP est perdu si le fournisseur répond une erreur passagère. La confirmation
 * de réservation est bien enregistrée, mais le client ne reçoit rien et
 * personne ne l'apprend.
 *
 * **Sans Redis, la tâche est exécutée en ligne**, exactement comme avant cette
 * phase. La dégradation n'ajoute donc aucun risque : elle rétablit le
 * comportement précédent, qui était déjà celui de la production actuelle.
 */

declare global {
  var __tourismQueues: Map<QueueName, Queue> | undefined;
}

/**
 * BullMQ exige `maxRetriesPerRequest: null`.
 *
 * Ses connexions exécutent des commandes bloquantes (`BRPOPLPUSH`) qui attendent
 * volontairement plusieurs secondes. Avec un plafond de réessais, ioredis
 * considère cette attente comme un échec et coupe la connexion en boucle.
 * C'est l'inverse du réglage retenu pour le cache, et pour une raison opposée :
 * ici la connexion doit tenir, là elle doit renoncer vite.
 */
function queueConnection() {
  return redisOptions({
    maxRetriesPerRequest: null,
    enableOfflineQueue: true,
    lazyConnect: false,
  });
}

function getQueue(name: QueueName): Queue | null {
  const url = env().REDIS_URL;
  if (!url) return null;

  globalThis.__tourismQueues ??= new Map();
  const existing = globalThis.__tourismQueues.get(name);
  if (existing) return existing;

  const queue = new Queue(name, {
    connection: { ...queueConnection(), ...parseRedisUrl(url) },
    prefix: `${env().REDIS_KEY_PREFIX}:bull`,
    defaultJobOptions: {
      attempts: QUEUE_DEFAULTS.attempts,
      backoff: { type: 'exponential', delay: QUEUE_DEFAULTS.backoffDelayMs },
      removeOnComplete: { count: QUEUE_DEFAULTS.removeOnCompleteCount },
      removeOnFail: { count: QUEUE_DEFAULTS.removeOnFailCount },
    },
  });

  queue.on('error', (error: Error) => {
    logger.warn('file indisponible', { queue: name, message: error.message });
  });

  globalThis.__tourismQueues.set(name, queue);
  return queue;
}

/**
 * BullMQ attend un objet de connexion, pas une URL.
 *
 * `ioredis` sait analyser une URL, mais BullMQ crée ses propres connexions à
 * partir des options qu'on lui passe : lui donner l'URL brute dans un champ
 * qu'il n'interprète pas ferait tomber le worker sur `localhost` sans mot de
 * passe, en silence.
 */
function parseRedisUrl(url: string): {
  host: string;
  port: number;
  password?: string;
  username?: string;
  db?: number;
  tls?: Record<string, never>;
} {
  const parsed = new URL(url);
  const db = parsed.pathname.replace('/', '');

  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    ...(parsed.password ? { password: decodeURIComponent(parsed.password) } : {}),
    ...(parsed.username ? { username: decodeURIComponent(parsed.username) } : {}),
    ...(db ? { db: Number(db) } : {}),
    // `rediss://` impose TLS. L'omettre avec un fournisseur géré (Upstash,
    // Redis Cloud) donne une erreur de protocole difficile à rattacher à sa cause.
    ...(parsed.protocol === 'rediss:' ? { tls: {} } : {}),
  };
}

/** Vrai si les files sont opérationnelles. Utilisé par le point de santé. */
export function queuesEnabled(): boolean {
  return Boolean(env().REDIS_URL);
}

/**
 * Met un email en file.
 *
 * `fallback` est exécuté si Redis est absent. Le passer explicitement plutôt
 * que d'importer `mailer()` ici évite que le backend embarque le fournisseur
 * d'emails dans chaque bundle de route qui ne fait qu'enfiler une tâche.
 */
export async function enqueueMail(
  payload: SendMailJob,
  fallback: () => Promise<void>,
): Promise<void> {
  const queue = getQueue(QUEUE_NAMES.MAIL);

  if (!queue) {
    await fallback();
    return;
  }

  try {
    await queue.add(JOB_NAMES.SEND_MAIL, payload);
  } catch (error) {
    logger.warn('dépôt en file échoué, envoi direct', {
      message: error instanceof Error ? error.message : String(error),
    });
    await fallback();
  }
}

/**
 * Programme un rappel d'excursion.
 *
 * `jobId` est déterministe : BullMQ refuse un identifiant déjà présent. C'est
 * ce qui rend l'opération idempotente. Sans cela, une réservation modifiée deux
 * fois programmerait deux rappels, et le client recevrait le même message en
 * double — le genre de défaut qui fait désactiver les notifications.
 *
 * Le séparateur est un tiret, pas un deux-points : **BullMQ rejette les
 * identifiants contenant `:`**, ce caractère structurant ses propres clés
 * Redis. Une convention `reminder:<id>` fait échouer chaque programmation, et
 * l'échec est discret — la réservation est confirmée, la réponse est correcte,
 * seul le rappel n'existe pas.
 */
export async function scheduleExcursionReminder(
  payload: ExcursionReminderJob,
  sendAt: Date,
): Promise<void> {
  const queue = getQueue(QUEUE_NAMES.REMINDER);
  if (!queue) return;

  const delay = sendAt.getTime() - Date.now();

  // Excursion trop proche — ou déjà passée : le rappel n'a plus d'objet.
  // Le programmer avec un délai négatif le ferait partir immédiatement.
  if (delay <= 0) return;

  try {
    await queue.add(JOB_NAMES.EXCURSION_REMINDER, payload, {
      delay,
      jobId: reminderJobId(payload.excursionBookingId),
    });
  } catch (error) {
    logger.warn('programmation du rappel échouée', {
      excursionBookingId: payload.excursionBookingId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Identifiant de tâche d'un rappel.
 *
 * Fonction partagée par la programmation et l'annulation : deux constructions
 * séparées finiraient par diverger, et l'annulation ne trouverait alors jamais
 * la tâche qu'elle cherche.
 */
export function reminderJobId(excursionBookingId: string): string {
  return `reminder-${excursionBookingId}`;
}

/** Annule un rappel programmé, lorsqu'une réservation est annulée. */
export async function cancelExcursionReminder(excursionBookingId: string): Promise<void> {
  const queue = getQueue(QUEUE_NAMES.REMINDER);
  if (!queue) return;

  try {
    const job = await queue.getJob(reminderJobId(excursionBookingId));
    await job?.remove();
  } catch (error) {
    logger.warn('annulation du rappel échouée', {
      excursionBookingId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Ferme les files. Utilisé par les scripts, qui doivent rendre la main. */
export async function closeQueues(): Promise<void> {
  const queues = globalThis.__tourismQueues;
  globalThis.__tourismQueues = undefined;
  if (!queues) return;
  await Promise.all([...queues.values()].map((queue) => queue.close().catch(() => undefined)));
}
