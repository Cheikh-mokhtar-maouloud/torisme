import { Queue, Worker, type Job } from 'bullmq';

import { JOB_NAMES, QUEUE_DEFAULTS, QUEUE_NAMES } from '@tourism/shared/constants';
import { excursionReminderJobSchema, sendMailJobSchema } from '@tourism/shared/validation';

import { callInternal } from './backend-client.js';
import { config, redisConnection } from './config.js';

/**
 * Worker BullMQ.
 *
 * Il ne contient **aucune logique métier** : chaque tâche se résout en un appel
 * à une route interne du backend. C'est la règle posée dès la Phase 1 — la
 * logique vit à un seul endroit — et elle vaut ici autant que pour le mobile ou
 * le dashboard. Le worker n'apporte que ce qu'un backend serverless ne sait pas
 * faire : réessayer, différer, répéter.
 */

const prefix = `${config.REDIS_KEY_PREFIX}:bull`;

function log(
  level: 'info' | 'warn' | 'error',
  message: string,
  meta: Record<string, unknown> = {},
) {
  // Journal structuré en JSON, comme le backend : une ligne par événement,
  // exploitable par un agrégateur sans expression régulière.
  const line = JSON.stringify({
    level,
    message,
    service: 'worker',
    time: new Date().toISOString(),
    ...meta,
  });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

/* -------------------------------------------------------------------------- */
/* Traitements                                                                 */
/* -------------------------------------------------------------------------- */

async function processMail(job: Job): Promise<void> {
  // Validation à la réception : la tâche peut avoir été déposée par une version
  // antérieure du backend et être restée en file pendant un déploiement.
  const payload = sendMailJobSchema.parse(job.data);
  await callInternal('/api/internal/mail', payload);
}

async function processReminder(job: Job): Promise<void> {
  const payload = excursionReminderJobSchema.parse(job.data);
  const result = await callInternal<{ sent: boolean; reason?: string }>(
    '/api/internal/reminders',
    payload,
  );

  // Un rappel non envoyé n'est pas un échec : la réservation a pu être annulée
  // entre la programmation et l'échéance. On le trace sans faire échouer.
  if (!result.sent) {
    log('info', 'rappel sans objet', { jobId: job.id, reason: result.reason });
  }
}

async function processMaintenance(): Promise<void> {
  const report = await callInternal<Record<string, number>>('/api/internal/maintenance', {});
  const total = Object.values(report).reduce((sum, value) => sum + value, 0);
  if (total > 0) log('info', 'entretien effectué', report);
}

/* -------------------------------------------------------------------------- */
/* Démarrage                                                                   */
/* -------------------------------------------------------------------------- */

const connection = redisConnection();

const workers = [
  new Worker(QUEUE_NAMES.MAIL, processMail, {
    connection,
    prefix,
    concurrency: config.WORKER_CONCURRENCY,
  }),
  new Worker(QUEUE_NAMES.REMINDER, processReminder, { connection, prefix, concurrency: 2 }),
  new Worker(QUEUE_NAMES.MAINTENANCE, processMaintenance, { connection, prefix, concurrency: 1 }),
];

for (const worker of workers) {
  worker.on('failed', (job, error) => {
    const attempts = job?.attemptsMade ?? 0;
    const definitive = attempts >= QUEUE_DEFAULTS.attempts;

    /*
     * Un échec intermédiaire est un `warn` : il sera réessayé. Seul l'échec
     * définitif est une `error`, parce qu'il signifie qu'un email ne partira
     * jamais. Traiter les deux au même niveau ferait déclencher des alertes
     * pour des incidents que le système règle tout seul.
     */
    log(definitive ? 'error' : 'warn', definitive ? 'tâche abandonnée' : 'tâche échouée', {
      queue: worker.name,
      jobId: job?.id,
      attempts,
      errorMessage: error.message,
    });
  });

  worker.on('error', (error) => {
    log('warn', 'erreur de worker', { queue: worker.name, errorMessage: error.message });
  });
}

/**
 * Tâche répétée d'entretien.
 *
 * `jobId` fixe : BullMQ ne conserve qu'un planning par identifiant. Sans lui,
 * chaque redémarrage du worker ajouterait une répétition de plus, et
 * l'entretien finirait par tourner des dizaines de fois par heure.
 */
const maintenanceQueue = new Queue(QUEUE_NAMES.MAINTENANCE, { connection, prefix });

async function scheduleMaintenance(announce = true): Promise<void> {
  await maintenanceQueue.upsertJobScheduler(
    'maintenance-periodique',
    { every: config.MAINTENANCE_INTERVAL_MINUTES * 60_000 },
    {
      name: JOB_NAMES.RUN_MAINTENANCE,
      opts: {
        // Une tâche d'entretien ratée n'a pas besoin d'être réessayée : la
        // prochaine occurrence, une heure plus tard, fera le même travail.
        attempts: 1,
        removeOnComplete: { count: 24 },
        removeOnFail: { count: 48 },
      },
    },
  );

  if (!announce) return;

  log('info', 'worker démarré', {
    env: config.APP_ENV,
    queues: Object.values(QUEUE_NAMES),
    concurrency: config.WORKER_CONCURRENCY,
    maintenanceIntervalMinutes: config.MAINTENANCE_INTERVAL_MINUTES,
  });
}

/*
 * Le planning est réaffirmé périodiquement, pas seulement au démarrage.
 *
 * Un Redis redémarré sans persistance — ou simplement purgé — perd ses
 * plannings. Le worker, lui, ne s'aperçoit de rien : l'entretien cesse
 * définitivement de tourner, sans une seule erreur pour le signaler, et le
 * défaut ne se voit que des semaines plus tard sur des statuts qui n'avancent
 * plus.
 *
 * Le déclencheur est un intervalle et non l'événement `ready` d'ioredis : une
 * purge ne coupe pas la connexion, et un correctif fondé sur la reconnexion
 * laisserait ce cas béant. `upsertJobScheduler` est idempotent, donc la
 * répétition ne coûte rien.
 */
const REASSERT_INTERVAL_MS = 15 * 60_000;

const reassert = setInterval(() => {
  void scheduleMaintenance(false).catch((error: Error) => {
    log('warn', 'réaffirmation du planning échouée', { errorMessage: error.message });
  });
}, REASSERT_INTERVAL_MS);

// Sans `unref`, cet intervalle maintiendrait le processus en vie et empêcherait
// un arrêt propre de rendre la main.
reassert.unref();

void scheduleMaintenance().catch((error: Error) => {
  // Sans planning, l'entretien ne tournerait jamais et les statuts
  // n'avanceraient plus. C'est un défaut de démarrage, pas un incident à
  // absorber : on refuse de tourner en donnant l'illusion de fonctionner.
  log('error', 'planification de l’entretien impossible', { errorMessage: error.message });
  process.exit(1);
});

/*
 * Arrêt propre. `close()` attend la fin des tâches en cours avant de rendre la
 * main : tuer le processus au milieu d'un envoi laisserait la tâche en état
 * « active » jusqu'à l'expiration de son verrou, puis la ferait rejouer — donc
 * un email en double.
 */
async function shutdown(signal: string): Promise<void> {
  log('info', 'arrêt en cours', { signal });
  clearInterval(reassert);
  await Promise.all([...workers.map((worker) => worker.close()), maintenanceQueue.close()]);
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
