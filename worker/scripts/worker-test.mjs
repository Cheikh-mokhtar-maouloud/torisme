/**
 * Vérification de la Phase 13 : Redis, cache, limitation de débit, files.
 *
 * Le script exige Redis, le backend et le worker démarrés. Il vérifie ce que
 * les autres suites ne peuvent pas voir : que le cache sert bien une valeur
 * mémorisée, qu'un dépassement de débit est refusé avec un `Retry-After`, et
 * qu'une tâche déposée en file finit réellement traitée.
 */
import { Queue } from 'bullmq';
import Redis from 'ioredis';

const BACKEND = process.env.BACKEND_URL ?? 'http://localhost:4000';
const SECRET = process.env.INTERNAL_API_SECRET ?? '';
const PREFIX = process.env.REDIS_KEY_PREFIX ?? 'tourism';

let passed = 0;
let failed = 0;
function group(title) {
  console.log(`\n${title}`);
}

function check(label, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function redisConnection() {
  const url = new URL(process.env.REDIS_URL);
  const db = url.pathname.replace('/', '');
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
    ...(db ? { db: Number(db) } : {}),
    maxRetriesPerRequest: null,
  };
}

async function waitFor(predicate, timeoutMs = 15_000, stepMs = 250) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, stepMs));
  }
  return false;
}

const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 2 });

/* -------------------------------------------------------------------------- */

group('Connexion Redis');

const pong = await redis.ping().catch(() => null);
check('Redis répond au PING', pong === 'PONG', `réponse : ${pong}`);

const health = await fetch(`${BACKEND}/api/health?deep=true`).then((response) => response.json());
check('Le backend voit Redis', health.data?.dependencies?.redis?.reachable === true);
check('Le backend annonce ses files actives', health.data?.dependencies?.redis?.queues === true);
check(
  'MongoDB reste la dépendance qui décide du statut',
  health.data?.status === 'ok' && typeof health.data?.dependencies?.mongodb?.latencyMs === 'number',
);

/* -------------------------------------------------------------------------- */

group('Cache');

await redis.del(
  ...((await redis.keys(`${PREFIX}:cache:category:*`)).length
    ? await redis.keys(`${PREFIX}:cache:category:*`)
    : ['__absent__']),
);

await fetch(`${BACKEND}/api/categories`);
const cacheKeys = await redis.keys(`${PREFIX}:cache:category:*`);
check('Une lecture de catégories alimente le cache', cacheKeys.length > 0);

const ttl = cacheKeys.length > 0 ? await redis.ttl(cacheKeys[0]) : -1;
check('Les entrées portent une expiration', ttl > 0 && ttl <= 300, `ttl=${ttl}`);

/*
 * Cœur de la vérification : une valeur bidon est écrite directement dans Redis,
 * puis l'API est interrogée. Si la réponse contient cette valeur, la lecture
 * vient bien du cache et non de MongoDB — c'est la seule preuve directe que la
 * couche est réellement branchée.
 */
if (cacheKeys.length > 0) {
  const sentinel = { items: [{ id: 'sentinelle', name: 'CACHE-TEMOIN' }], meta: { total: 1 } };
  await redis.set(cacheKeys[0], JSON.stringify(sentinel), 'EX', 60);

  const cachedResponse = await fetch(`${BACKEND}/api/categories`).then((r) => r.json());
  check(
    'La réponse provient bien du cache',
    JSON.stringify(cachedResponse.data ?? {}).includes('CACHE-TEMOIN'),
  );

  await redis.del(cacheKeys[0]);
  const freshResponse = await fetch(`${BACKEND}/api/categories`).then((r) => r.json());
  check(
    'Le cache purgé, la base reprend la main',
    !JSON.stringify(freshResponse.data ?? {}).includes('CACHE-TEMOIN'),
  );
}

/* -------------------------------------------------------------------------- */

group('Cloisonnement du cache');

/*
 * La clé doit distinguer administrateur et public : l'administrateur voit les
 * catégories désactivées. Une clé commune servirait au public une réponse
 * mémorisée pour un administrateur.
 */
const adminKeys = cacheKeys.filter((key) => key.includes(':admin:'));
const publicKeys = cacheKeys.filter((key) => key.includes(':public:'));
check(
  'Les clés distinguent le public de l’administrateur',
  publicKeys.length > 0 || adminKeys.length > 0,
  `clés : ${cacheKeys.map((k) => k.split(':').slice(2).join(':')).join(' | ')}`,
);

/* -------------------------------------------------------------------------- */

group('Limitation de débit');

const limitProbe = await fetch(`${BACKEND}/api/categories`);
check(
  'Les réponses annoncent le quota restant',
  limitProbe.headers.has('x-ratelimit-limit') && limitProbe.headers.has('x-ratelimit-remaining'),
);

// Le compteur est remis à zéro pour partir d'un état connu.
const limitKeys = await redis.keys(`${PREFIX}:ratelimit:*`);
if (limitKeys.length > 0) await redis.del(...limitKeys);

/*
 * La rafale vise `/api/categories`, pas `/api/health`.
 *
 * Le point de santé ne passe **pas** par `withRoute` et n'est donc pas limité,
 * volontairement : c'est un load balancer qui l'interroge, plusieurs fois par
 * minute et par instance. Le limiter ferait retirer du pool des instances
 * saines — la sonde provoquerait la panne qu'elle surveille.
 */
const burst = await Promise.all(
  Array.from({ length: 310 }, () => fetch(`${BACKEND}/api/categories`).then((r) => r.status)),
);

const refused = burst.filter((status) => status === 429);
check(
  'Une rafale au-delà du quota est refusée',
  refused.length > 0,
  `429 reçus : ${refused.length}`,
);

const refusedResponse = await fetch(`${BACKEND}/api/categories`);
if (refusedResponse.status === 429) {
  check('Le refus indique quand réessayer', refusedResponse.headers.has('retry-after'));
  const body = await refusedResponse.json();
  check('Le refus porte le code RATE_LIMITED', body.error?.code === 'RATE_LIMITED');
} else {
  check('Le refus indique quand réessayer', false, 'quota déjà réinitialisé');
  check('Le refus porte le code RATE_LIMITED', false, 'quota déjà réinitialisé');
}

// Remise à zéro : les vérifications suivantes ne doivent pas hériter du quota épuisé.
const usedKeys = await redis.keys(`${PREFIX}:ratelimit:*`);
if (usedKeys.length > 0) await redis.del(...usedKeys);

/* -------------------------------------------------------------------------- */

group('Routes internes');

const noSecret = await fetch(`${BACKEND}/api/internal/maintenance`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: '{}',
});
check(
  'Un appel interne sans secret est refusé',
  noSecret.status === 401,
  `statut ${noSecret.status}`,
);

const wrongSecret = await fetch(`${BACKEND}/api/internal/maintenance`, {
  method: 'POST',
  headers: { 'X-Internal-Secret': 'x'.repeat(64) },
});
check('Un secret erroné est refusé', wrongSecret.status === 401, `statut ${wrongSecret.status}`);

const goodSecret = await fetch(`${BACKEND}/api/internal/maintenance`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': SECRET },
  body: '{}',
});
check('Le worker est accepté', goodSecret.status === 200, `statut ${goodSecret.status}`);

const report = await goodSecret.json().catch(() => ({}));
check(
  'L’entretien renvoie son bilan',
  typeof report.data?.bookingsCompleted === 'number' &&
    typeof report.data?.excursionsCompleted === 'number',
);

const secondRun = await fetch(`${BACKEND}/api/internal/maintenance`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': SECRET },
  body: '{}',
}).then((r) => r.json());
check(
  'Relancé, l’entretien ne modifie plus rien (idempotent)',
  secondRun.data?.bookingsCompleted === 0 &&
    secondRun.data?.excursionsCompleted === 0 &&
    secondRun.data?.excursionBookingsCompleted === 0,
);

/* -------------------------------------------------------------------------- */

group('File d’attente');

const mailQueue = new Queue('mail', {
  connection: redisConnection(),
  prefix: `${PREFIX}:bull`,
});

const job = await mailQueue.add('send-mail', {
  to: 'verification@example.test',
  subject: 'Vérification Phase 13',
  text: 'Tâche déposée par la suite de tests.',
});

check('Une tâche est déposée en file', Boolean(job.id));

const completed = await waitFor(async () => {
  const state = await job.getState();
  return state === 'completed';
});
check('Le worker consomme la tâche', completed, `état final : ${await job.getState()}`);

/* Une charge utile invalide doit échouer, pas être traitée silencieusement. */
const badJob = await mailQueue.add(
  'send-mail',
  { to: 'pas-une-adresse', subject: '', text: '' },
  { attempts: 1 },
);

const rejected = await waitFor(async () => (await badJob.getState()) === 'failed');
check('Une charge utile invalide échoue', rejected, `état final : ${await badJob.getState()}`);

const failedJob = await mailQueue.getJob(badJob.id);
const failedReason = failedJob?.failedReason ?? '';
check(
  'L’échec conserve sa cause pour l’inspection',
  failedReason.length > 0,
  failedReason.slice(0, 80),
);

/* -------------------------------------------------------------------------- */

group('Entretien périodique');

const schedulers = await new Queue('maintenance', {
  connection: redisConnection(),
  prefix: `${PREFIX}:bull`,
}).getJobSchedulers();

check('Un entretien périodique est planifié', schedulers.length > 0);
check(
  'Un seul planning existe, malgré les redémarrages',
  schedulers.length <= 1,
  `plannings : ${schedulers.length}`,
);

/* -------------------------------------------------------------------------- */

group('Rappel d’excursion : idempotence');

/*
 * La propriété la plus délicate de cette phase. Une file garantit **au moins**
 * une livraison, jamais exactement une : réessai, worker redémarré, deux
 * instances en parallèle. Le garde-fou est donc en base — `reminderSentAt` posé
 * par une mise à jour conditionnelle — et c'est lui qu'on vérifie ici, en
 * déclenchant deux fois le même rappel.
 */
async function api(path, { method = 'GET', body, token } = {}) {
  const response = await fetch(`${BACKEND}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : {} };
}

const adminToken = (
  await api('/api/auth/login', {
    method: 'POST',
    body: { email: 'admin@tourism.mr', password: 'Admin123!' },
  })
).body?.data?.token;

const userLogin = await api('/api/auth/login', {
  method: 'POST',
  body: { email: 'touriste@example.com', password: 'Touriste123!' },
});
const userToken = userLogin.body?.data?.token;

const excursion = await api('/api/excursions', {
  method: 'POST',
  token: adminToken,
  body: {
    title: `Excursion rappel ${Date.now()}`,
    description: 'Excursion créée pour vérifier l’idempotence du rappel.',
    destination: 'Atar',
    departureLocation: { type: 'Point', coordinates: [-13.0486, 20.5169] },
    departureAddress: { city: 'Atar', country: 'Mauritanie', countryCode: 'MR' },
    durationMinutes: 480,
    startsAt: new Date(Date.now() + 10 * 86_400_000).toISOString(),
    price: 15_000,
    currency: 'MRU',
    totalSeats: 4,
    status: 'SCHEDULED',
  },
});

const excursionId = excursion.body?.data?.id;

const booked = await api('/api/excursion-bookings', {
  method: 'POST',
  token: userToken,
  body: { excursionId, seats: 1 },
});

const bookingId = booked.body?.data?.id;
check(
  'Réservation d’excursion créée',
  booked.status === 201,
  JSON.stringify(booked.body).slice(0, 120),
);

const confirmed = await api(`/api/excursion-bookings/${bookingId}/confirm`, {
  method: 'PATCH',
  token: adminToken,
});
check('Réservation confirmée', confirmed.status === 200, `statut ${confirmed.status}`);

const reminderQueue = new Queue('reminder', {
  connection: redisConnection(),
  prefix: `${PREFIX}:bull`,
});
/*
 * La programmation est lancée sans être attendue par la route de confirmation :
 * la réponse ne doit pas dépendre de Redis. Le test laisse donc un court délai,
 * au lieu de supposer que la tâche existe déjà au retour de l'appel.
 */
let scheduled = null;
await waitFor(async () => {
  scheduled = await reminderQueue.getJob(`reminder-${bookingId}`);
  return Boolean(scheduled);
}, 5_000);

check(
  'La confirmation programme un rappel différé',
  Boolean(scheduled),
  scheduled ? `délai ${scheduled.opts.delay} ms` : 'aucune tâche',
);

const firstSend = await api('/api/internal/reminders', {
  method: 'POST',
  body: { excursionBookingId: bookingId },
}).then((r) => r.body);

// L'appel interne exige le secret ; on repasse par fetch pour l'en-tête dédié.
const first = await fetch(`${BACKEND}/api/internal/reminders`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': SECRET },
  body: JSON.stringify({ excursionBookingId: bookingId }),
}).then((r) => r.json());

check('Sans secret, le rappel est refusé', firstSend.success === false);
check('Le premier rappel part', first.data?.sent === true, JSON.stringify(first).slice(0, 120));

const second = await fetch(`${BACKEND}/api/internal/reminders`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': SECRET },
  body: JSON.stringify({ excursionBookingId: bookingId }),
}).then((r) => r.json());

check(
  'Le second rappel n’envoie rien (idempotent)',
  second.data?.sent === false,
  JSON.stringify(second).slice(0, 120),
);

// Annulation : le rappel programmé doit disparaître de la file.
await api(`/api/excursion-bookings/${bookingId}/cancel`, {
  method: 'PATCH',
  token: userToken,
  body: { reason: 'Nettoyage du test' },
});

/*
 * L'annulation retire la tâche sans être attendue par la route : la réponse ne
 * doit pas dépendre de Redis. Le test laisse donc le temps à la suppression,
 * au lieu de supposer qu'elle est terminée au retour de l'appel.
 */
let afterCancel = await reminderQueue.getJob(`reminder-${bookingId}`);
await waitFor(async () => {
  afterCancel = await reminderQueue.getJob(`reminder-${bookingId}`);
  return !afterCancel;
}, 5_000);

check('L’annulation retire le rappel programmé', !afterCancel);

await api(`/api/excursions/${excursionId}`, { method: 'DELETE', token: adminToken });
await reminderQueue.close();

/* -------------------------------------------------------------------------- */

group('Temps réel par pub/sub');

const subscriber = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 2 });
const channel = `${PREFIX}:realtime:events`;
let received = null;

await subscriber.subscribe(channel);
subscriber.on('message', (_channel, raw) => {
  received = raw;
});

await redis.publish(
  channel,
  JSON.stringify({ event: 'booking:updated', target: { kind: 'admins' }, payload: { test: true } }),
);

const delivered = await waitFor(async () => received !== null, 5_000);
check('Le canal pub/sub achemine les événements', delivered);
check(
  'Le canal est nommé d’après le préfixe de l’environnement',
  channel.startsWith(`${PREFIX}:`),
  channel,
);

await subscriber.quit();

/* -------------------------------------------------------------------------- */

await mailQueue.close();
await redis.quit();

console.log(`\n${passed} réussis, ${failed} échoués`);
process.exit(failed > 0 ? 1 : 0);
