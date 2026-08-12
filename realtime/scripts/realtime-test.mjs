/**
 * Tests du service temps réel.
 *
 * Usage : backend ET service temps réel démarrés, base remplie, puis
 *   npm run test:realtime --workspace realtime
 *
 * Le point critique est le **cloisonnement** : un client ne doit recevoir que
 * les événements de son propre compte. Une erreur ici diffuserait à tous les
 * connectés le contenu des réservations de chacun.
 */
import { io } from 'socket.io-client';

const BACKEND_URL = process.env.SMOKE_BACKEND_URL ?? 'http://localhost:4000';
const REALTIME_URL = process.env.SMOKE_REALTIME_URL ?? 'http://localhost:4100';
const PUBLISH_SECRET = process.env.REALTIME_PUBLISH_SECRET ?? '';

let passed = 0;
let failed = 0;

function check(label, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${label}`);
    if (detail !== undefined) console.log(`        ${JSON.stringify(detail).slice(0, 250)}`);
  }
}

async function call(path, { method = 'GET', body, token } = {}) {
  const response = await fetch(`${BACKEND_URL}${path}`, {
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

/** Connexion Socket.IO, résolue à la connexion ou rejetée à l'échec. */
function connect(token) {
  return new Promise((resolve, reject) => {
    const socket = io(REALTIME_URL, {
      auth: token ? { token } : {},
      transports: ['websocket'],
      // Pas de réessai : un refus d'authentification doit remonter tout de
      // suite, pas après plusieurs tentatives silencieuses.
      reconnection: false,
      timeout: 4000,
    });

    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', (error) => {
      socket.close();
      reject(error);
    });
  });
}

/** Attend un événement précis, ou renvoie `null` au bout du délai. */
function waitFor(socket, event, timeoutMs = 2500) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

async function emit(event, target, payload, secret = PUBLISH_SECRET) {
  return fetch(`${REALTIME_URL}/emit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Publish-Secret': secret },
    body: JSON.stringify({ event, target, payload }),
  });
}

async function run() {
  console.log(`\nBackend   : ${BACKEND_URL}\nTemps réel : ${REALTIME_URL}\n`);

  /* --- Santé ------------------------------------------------------------------ */
  console.log('Santé');

  const health = await fetch(`${REALTIME_URL}/health`).then((response) => response.json());
  check('GET /health répond', health.status === 'ok', health);
  check('Le service annonce son nom', health.service === 'tourism-realtime', health.service);

  /* --- Authentification -------------------------------------------------------- */
  console.log('\nAuthentification');

  let rejectedWithoutToken = false;
  try {
    const socket = await connect(undefined);
    socket.close();
  } catch {
    rejectedWithoutToken = true;
  }
  check('Une connexion sans jeton est refusée', rejectedWithoutToken);

  let rejectedWithBadToken = false;
  try {
    const socket = await connect('jeton.invalide.evidemment');
    socket.close();
  } catch {
    rejectedWithBadToken = true;
  }
  check('Un jeton invalide est refusé', rejectedWithBadToken);

  const userLogin = await call('/api/auth/login', {
    method: 'POST',
    body: { email: 'touriste@example.com', password: 'Touriste123!' },
  });
  const userToken = userLogin.body?.data?.token;
  const userId = userLogin.body?.data?.user?.id;

  const adminLogin = await call('/api/auth/login', {
    method: 'POST',
    body: { email: 'admin@tourism.mr', password: 'Admin123!' },
  });
  const adminToken = adminLogin.body?.data?.token;

  const userSocket = await connect(userToken);
  check('Un jeton valide est accepté', userSocket.connected);

  const adminSocket = await connect(adminToken);
  check('Un administrateur se connecte également', adminSocket.connected);

  /* --- Publication -------------------------------------------------------------- */
  console.log('\nPublication');

  const unauthorized = await emit(
    'notification:new',
    { kind: 'user', userId },
    { title: 'Test' },
    'mauvais-secret',
  );
  check('Publier sans le bon secret → 401', unauthorized.status === 401, unauthorized.status);

  const malformed = await fetch(`${REALTIME_URL}/emit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Publish-Secret': PUBLISH_SECRET },
    body: JSON.stringify({ event: 'evenement:inconnu', target: { kind: 'admins' } }),
  });
  check('Un événement inconnu est rejeté → 422', malformed.status === 422, malformed.status);

  const received = waitFor(userSocket, 'notification:new');
  await emit('notification:new', { kind: 'user', userId }, { title: 'Bonjour', id: 'abc' });
  const payload = await received;

  check('L’événement atteint son destinataire', payload !== null, payload);
  check('La charge utile est transmise intacte', payload?.title === 'Bonjour', payload);

  /* --- Cloisonnement -------------------------------------------------------------- */
  console.log('\nCloisonnement');

  // L'administrateur ne doit **pas** recevoir l'événement du touriste.
  const leaked = waitFor(adminSocket, 'notification:new', 1500);
  await emit('notification:new', { kind: 'user', userId }, { title: 'Message privé' });
  const leakedPayload = await leaked;

  check(
    'Un événement destiné à un compte ne fuite pas vers un autre',
    leakedPayload === null,
    leakedPayload,
  );

  // La salle des administrateurs, elle, ne doit pas atteindre le touriste.
  const adminOnly = waitFor(adminSocket, 'admin:activity', 2500);
  const userShouldNotSee = waitFor(userSocket, 'admin:activity', 1500);
  await emit('admin:activity', { kind: 'admins' }, { title: 'Nouvelle demande' });

  check('La salle administrateurs reçoit son événement', (await adminOnly) !== null);
  check('Un client n’y a pas accès', (await userShouldNotSee) === null);

  /* --- Bout en bout depuis le backend ---------------------------------------------- */
  console.log('\nDe bout en bout');

  const rooms = await call('/api/rooms?limit=1');
  const roomId = rooms.body?.data?.items?.[0]?.id;
  const inDays = (days) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

  const booking = await call('/api/bookings', {
    method: 'POST',
    token: userToken,
    body: { roomId, checkIn: inDays(120), checkOut: inDays(122), guests: 1 },
  });

  const bookingUpdate = waitFor(userSocket, 'booking:updated', 3000);
  await call(`/api/bookings/${booking.body?.data?.id}/confirm`, {
    method: 'PATCH',
    token: adminToken,
  });
  const update = await bookingUpdate;

  check(
    'Confirmer une réservation pousse l’événement au client',
    update !== null && update.bookingId === booking.body?.data?.id,
    update,
  );
  check('Le nouveau statut est transmis', update?.status === 'CONFIRMED', update);

  const notificationEvent = waitFor(userSocket, 'notification:new', 3000);
  await call(`/api/bookings/${booking.body?.data?.id}/cancel`, {
    method: 'PATCH',
    token: userToken,
    body: {},
  });
  const notification = await notificationEvent;

  check(
    'Une notification métier est diffusée en temps réel',
    notification !== null && String(notification.title).length > 0,
    notification,
  );

  userSocket.close();
  adminSocket.close();

  console.log(`\n${passed} réussis, ${failed} échoués\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((error) => {
  console.error('Le test a échoué :', error);
  process.exit(1);
});
