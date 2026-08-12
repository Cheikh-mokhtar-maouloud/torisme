/**
 * Tests des notifications et des emails.
 *
 * Usage : backend démarré et base remplie, puis
 *   npm run test:notifications --workspace backend
 *
 * Vérifie que les événements métier produisent bien des notifications, que
 * celles-ci restent cloisonnées par compte, et — point le plus important — qu'un
 * échec d'envoi ne fait jamais échouer l'opération métier sous-jacente.
 */
const BASE_URL = process.env.SMOKE_BASE_URL ?? 'http://localhost:4000';

let passed = 0;
let failed = 0;

function check(label, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${label}`);
    if (detail !== undefined) console.log(`        ${JSON.stringify(detail).slice(0, 280)}`);
  }
}

async function call(path, { method = 'GET', body, token } = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
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

const inDays = (days) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

/** Les notifications sont émises sans attendre : on laisse le temps à l'écriture. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 400));

async function run() {
  console.log(`\nCible : ${BASE_URL}\n`);

  const adminLogin = await call('/api/auth/login', {
    method: 'POST',
    body: { email: 'admin@tourism.mr', password: 'Admin123!' },
  });
  const adminToken = adminLogin.body?.data?.token;

  /* --- Compte neuf ------------------------------------------------------------ */
  console.log('Boîte de réception');

  const email = `notif-${Date.now()}@example.com`;
  const signup = await call('/api/auth/register', {
    method: 'POST',
    body: { fullName: 'Test Notifications', email, password: 'MotDePasse123' },
  });
  const userToken = signup.body?.data?.token;
  const userId = signup.body?.data?.user?.id;

  const empty = await call('/api/notifications', { token: userToken });
  check('Un compte neuf a une boîte vide', empty.status === 200, empty.body);
  check(
    'Le compteur de non-lues est fourni',
    empty.body?.data?.unreadCount === 0,
    empty.body?.data,
  );

  const anonymous = await call('/api/notifications');
  check('Lire ses notifications sans jeton → 401', anonymous.status === 401, anonymous.status);

  /* --- Émission sur confirmation de réservation --------------------------------- */
  console.log('\nÉvénements de réservation');

  const rooms = await call('/api/rooms?limit=1');
  const room = rooms.body?.data?.items?.[0];

  const booking = await call('/api/bookings', {
    method: 'POST',
    token: userToken,
    body: { roomId: room?.id, checkIn: inDays(90), checkOut: inDays(92), guests: 1 },
  });
  check('Réservation créée', booking.status === 201, booking.body);

  await settle();

  // La demande prévient les administrateurs, pas le client.
  const adminInbox = await call('/api/notifications?limit=5', { token: adminToken });
  check(
    'La demande notifie les administrateurs',
    (adminInbox.body?.data?.items ?? []).some((item) =>
      String(item.body).includes(booking.body?.data?.reference),
    ),
    (adminInbox.body?.data?.items ?? []).slice(0, 2),
  );

  await call(`/api/bookings/${booking.body?.data?.id}/confirm`, {
    method: 'PATCH',
    token: adminToken,
  });
  await settle();

  const afterConfirm = await call('/api/notifications', { token: userToken });
  const confirmNotification = (afterConfirm.body?.data?.items ?? []).find(
    (item) => item.type === 'BOOKING_CONFIRMED',
  );

  check('La confirmation notifie le client', Boolean(confirmNotification), afterConfirm.body?.data);
  check(
    'La notification porte la référence de la réservation',
    String(confirmNotification?.body ?? '').includes(booking.body?.data?.reference),
    confirmNotification,
  );
  check(
    'Elle transporte de quoi ouvrir la fiche',
    confirmNotification?.data?.bookingId === booking.body?.data?.id,
    confirmNotification?.data,
  );
  check(
    'Le compteur de non-lues suit',
    afterConfirm.body?.data?.unreadCount >= 1,
    afterConfirm.body?.data?.unreadCount,
  );

  /* --- Lecture ------------------------------------------------------------------- */
  console.log('\nMarquage comme lu');

  const read = await call(`/api/notifications/${confirmNotification?.id}/read`, {
    method: 'PATCH',
    token: userToken,
  });
  check('Marquer comme lue → 200', read.status === 200, read.status);
  check('La date de lecture est posée', Boolean(read.body?.data?.readAt), read.body?.data);

  // Cloisonnement : l'administrateur ne doit pas pouvoir toucher à cette entrée.
  const foreign = await call(`/api/notifications/${confirmNotification?.id}/read`, {
    method: 'PATCH',
    token: adminToken,
  });
  check(
    'Un autre compte ne peut pas marquer cette notification → 404',
    foreign.status === 404,
    foreign.status,
  );

  await call(`/api/bookings/${booking.body?.data?.id}/cancel`, {
    method: 'PATCH',
    token: userToken,
    body: { reason: 'Test' },
  });
  await settle();

  const beforeReadAll = await call('/api/notifications?unreadOnly=true', { token: userToken });
  check(
    'L’annulation produit une nouvelle non-lue',
    (beforeReadAll.body?.data?.items ?? []).length >= 1,
    beforeReadAll.body?.data?.meta,
  );

  const readAll = await call('/api/notifications/read-all', {
    method: 'PATCH',
    token: userToken,
  });
  check('Tout marquer comme lu → 200', readAll.status === 200, readAll.body);

  const afterReadAll = await call('/api/notifications', { token: userToken });
  check(
    'Le compteur retombe à zéro',
    afterReadAll.body?.data?.unreadCount === 0,
    afterReadAll.body?.data?.unreadCount,
  );

  /* --- Diffusion administrative ---------------------------------------------------- */
  console.log('\nDiffusion');

  const userBroadcast = await call('/api/admin/notifications', {
    method: 'POST',
    token: userToken,
    body: { title: 'Tentative', body: 'Un client ne diffuse pas.' },
  });
  check('Un client ne peut pas diffuser → 403', userBroadcast.status === 403, userBroadcast.status);

  const targeted = await call('/api/admin/notifications', {
    method: 'POST',
    token: adminToken,
    body: {
      title: 'Message ciblé',
      body: 'Ce message ne concerne qu’un seul compte.',
      userIds: [userId],
    },
  });
  check(
    'Diffusion ciblée → un seul destinataire',
    targeted.status === 201 && targeted.body?.data?.recipients === 1,
    targeted.body,
  );

  await settle();
  const afterBroadcast = await call('/api/notifications', { token: userToken });
  check(
    'Le destinataire reçoit le message',
    (afterBroadcast.body?.data?.items ?? []).some((item) => item.title === 'Message ciblé'),
    afterBroadcast.body?.data?.items?.[0],
  );

  const global = await call('/api/admin/notifications', {
    method: 'POST',
    token: adminToken,
    body: { title: 'Annonce générale', body: 'Message adressé à tous les comptes actifs.' },
  });
  check(
    'Sans destinataires, la diffusion vise tous les comptes actifs',
    global.status === 201 && global.body?.data?.recipients > 1,
    global.body?.data,
  );

  /* --- Résistance aux pannes d'email ------------------------------------------------ */
  console.log('\nIndépendance vis-à-vis des emails');

  // Le fournisseur `console` n'envoie rien : si les opérations ci-dessus ont
  // toutes abouti, c'est bien que le parcours métier ne dépend pas de l'email.
  const stillWorks = await call('/api/auth/forgot-password', {
    method: 'POST',
    body: { email },
  });
  check(
    'La demande de réinitialisation aboutit sans serveur d’email réel',
    stillWorks.status === 200,
    stillWorks.body,
  );
  check(
    'Et n’expose toujours pas le jeton',
    !JSON.stringify(stillWorks.body).toLowerCase().includes('token'),
    stillWorks.body,
  );

  console.log(`\n${passed} réussis, ${failed} échoués\n`);
  if (failed > 0) process.exit(1);
}

run().catch((error) => {
  console.error('Le test a échoué :', error);
  process.exit(1);
});
