/**
 * Tests de réservation d'excursion.
 *
 * Usage : backend démarré et base remplie, puis
 *   npm run test:excursions --workspace backend
 *
 * Le cœur du test est la concurrence sur `availableSeats` : plusieurs demandes
 * simultanées ne doivent jamais vendre plus de places qu'il n'en existe. Ici,
 * contrairement à l'hébergement, la contrainte tient dans un seul document et
 * l'atomicité de `findOneAndUpdate` suffit — ce test vérifie que c'est bien le
 * cas en pratique.
 */
const BASE_URL = process.env.SMOKE_BASE_URL ?? 'http://localhost:4000';
const TOTAL_SEATS = 5;
const CONCURRENT_REQUESTS = 15;

let passed = 0;
let failed = 0;

function check(label, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${label}`);
    if (detail !== undefined) console.log(`        ${JSON.stringify(detail).slice(0, 300)}`);
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

async function login(email, password) {
  const response = await call('/api/auth/login', { method: 'POST', body: { email, password } });
  return response.body?.data?.token ?? '';
}

const inDays = (days) => new Date(Date.now() + days * 86_400_000).toISOString();

async function run() {
  console.log(`\nCible : ${BASE_URL}\n`);

  const adminToken = await login('admin@tourism.mr', 'Admin123!');
  const userToken = await login('touriste@example.com', 'Touriste123!');

  /* --- Excursion dédiée ------------------------------------------------------ */
  console.log('Préparation');

  const excursion = await call('/api/excursions', {
    method: 'POST',
    token: adminToken,
    body: {
      title: `Excursion de test ${Date.now()}`,
      description: 'Excursion créée pour le test de concurrence, supprimée à la fin.',
      destination: 'Atar',
      departureLocation: { type: 'Point', coordinates: [-13.0486, 20.5169] },
      departureAddress: { city: 'Atar', country: 'Mauritanie', countryCode: 'MR' },
      durationMinutes: 480,
      startsAt: inDays(30),
      price: 20_000,
      currency: 'MRU',
      totalSeats: TOTAL_SEATS,
      status: 'SCHEDULED',
    },
  });

  const excursionId = excursion.body?.data?.id;
  check('Excursion créée → 201', excursion.status === 201, excursion.body);
  check(
    'Les places disponibles sont initialisées au total',
    excursion.body?.data?.availableSeats === TOTAL_SEATS,
    excursion.body?.data,
  );
  if (!excursionId) return report();

  /* --- Refus élémentaires ---------------------------------------------------- */
  console.log('\nRègles de réservation');

  const anonymous = await call('/api/excursion-bookings', {
    method: 'POST',
    body: { excursionId, seats: 1 },
  });
  check('Réserver sans jeton → 401', anonymous.status === 401, anonymous.status);

  const tooMany = await call('/api/excursion-bookings', {
    method: 'POST',
    token: userToken,
    body: { excursionId, seats: 50 },
  });
  check('Au-delà du plafond par réservation → 422', tooMany.status === 422, tooMany.status);

  const past = await call('/api/excursions', {
    method: 'POST',
    token: adminToken,
    body: {
      title: `Excursion passée ${Date.now()}`,
      description: 'Excursion dont la date est révolue, pour vérifier le refus.',
      destination: 'Nouakchott',
      departureLocation: { type: 'Point', coordinates: [-15.9582, 18.0735] },
      departureAddress: { city: 'Nouakchott', country: 'Mauritanie', countryCode: 'MR' },
      durationMinutes: 240,
      startsAt: inDays(-5),
      price: 5000,
      currency: 'MRU',
      totalSeats: 10,
      status: 'SCHEDULED',
    },
  });

  const pastBooking = await call('/api/excursion-bookings', {
    method: 'POST',
    token: userToken,
    body: { excursionId: past.body?.data?.id, seats: 1 },
  });
  check('Réserver une excursion passée → 409', pastBooking.status === 409, pastBooking.body?.error);

  /* --- Concurrence sur les places -------------------------------------------- */
  console.log(
    `\nConcurrence — ${CONCURRENT_REQUESTS} demandes de 1 place, ${TOTAL_SEATS} disponibles`,
  );

  const attempts = Array.from({ length: CONCURRENT_REQUESTS }, () =>
    call('/api/excursion-bookings', {
      method: 'POST',
      token: userToken,
      body: { excursionId, seats: 1 },
    }),
  );

  const results = await Promise.all(attempts);
  const accepted = results.filter((result) => result.status === 201);
  const refused = results.filter((result) => result.status === 409);
  const unexpected = results.filter((result) => result.status !== 201 && result.status !== 409);

  check(
    `Exactement ${TOTAL_SEATS} réservations aboutissent`,
    accepted.length === TOTAL_SEATS,
    `acceptées=${accepted.length} refusées=${refused.length} autres=${unexpected.length}`,
  );
  check(
    'Les autres sont refusées proprement (409)',
    refused.length === CONCURRENT_REQUESTS - TOTAL_SEATS,
    results.map((result) => result.status),
  );
  check(
    'Aucune erreur serveur',
    unexpected.length === 0,
    unexpected.map((r) => r.body),
  );
  check(
    'Le code d’erreur est EXCURSION_FULL',
    refused.every((result) => result.body?.error?.code === 'EXCURSION_FULL'),
    refused[0]?.body?.error,
  );

  const afterRush = await call(`/api/excursions/${excursionId}`);
  check(
    'Il ne reste aucune place',
    afterRush.body?.data?.availableSeats === 0,
    afterRush.body?.data,
  );
  check(
    'L’excursion passe automatiquement en COMPLET',
    afterRush.body?.data?.status === 'FULL',
    afterRush.body?.data?.status,
  );

  /* --- Annulation et restitution ---------------------------------------------- */
  console.log('\nAnnulation');

  const first = accepted[0]?.body?.data;
  const cancelled = await call(`/api/excursion-bookings/${first?.id}/cancel`, {
    method: 'PATCH',
    token: userToken,
    body: {},
  });
  check('Annulation → 200', cancelled.status === 200, cancelled.body);

  const afterCancel = await call(`/api/excursions/${excursionId}`);
  check(
    'La place est restituée',
    afterCancel.body?.data?.availableSeats === 1,
    afterCancel.body?.data?.availableSeats,
  );
  check(
    'L’excursion redevient PROGRAMMÉE',
    afterCancel.body?.data?.status === 'SCHEDULED',
    afterCancel.body?.data?.status,
  );

  const doubleCancel = await call(`/api/excursion-bookings/${first?.id}/cancel`, {
    method: 'PATCH',
    token: userToken,
    body: {},
  });
  check('Annuler deux fois → 409', doubleCancel.status === 409, doubleCancel.status);

  const stillOne = await call(`/api/excursions/${excursionId}`);
  check(
    'La double annulation ne rend pas la place deux fois',
    stillOne.body?.data?.availableSeats === 1,
    stillOne.body?.data?.availableSeats,
  );

  /* --- Cloisonnement ----------------------------------------------------------- */
  console.log('\nCloisonnement');

  const otherAccount = await call('/api/auth/register', {
    method: 'POST',
    body: {
      fullName: 'Curieux Excursion',
      email: `curieux-exc-${Date.now()}@example.com`,
      password: 'MotDePasse123',
    },
  });
  const otherToken = otherAccount.body?.data?.token;

  const second = accepted[1]?.body?.data;
  const stolen = await call(`/api/excursion-bookings/${second?.id}`, { token: otherToken });
  check('Un tiers ne peut pas lire la réservation → 404', stolen.status === 404, stolen.status);

  const otherList = await call('/api/excursion-bookings', { token: otherToken });
  check(
    'Un tiers ne voit rien dans sa liste',
    (otherList.body?.data?.items ?? []).length === 0,
    otherList.body?.data?.meta,
  );

  /* --- Confirmation administrateur --------------------------------------------- */
  console.log('\nConfirmation');

  const userConfirm = await call(`/api/excursion-bookings/${second?.id}/confirm`, {
    method: 'PATCH',
    token: userToken,
  });
  check('Un client ne peut pas confirmer → 403', userConfirm.status === 403, userConfirm.status);

  const adminConfirm = await call(`/api/excursion-bookings/${second?.id}/confirm`, {
    method: 'PATCH',
    token: adminToken,
  });
  check(
    'Un administrateur confirme → CONFIRMED',
    adminConfirm.status === 200 && adminConfirm.body?.data?.status === 'CONFIRMED',
    adminConfirm.body,
  );

  /* --- Nettoyage ---------------------------------------------------------------- */
  for (const result of accepted) {
    await call(`/api/excursion-bookings/${result.body?.data?.id}/cancel`, {
      method: 'PATCH',
      token: userToken,
      body: {},
    });
  }
  await call(`/api/excursions/${excursionId}`, { method: 'DELETE', token: adminToken });
  await call(`/api/excursions/${past.body?.data?.id}`, { method: 'DELETE', token: adminToken });
  console.log('\n  (réservations annulées, excursions de test supprimées)');

  report();
}

function report() {
  console.log(`\n${passed} réussis, ${failed} échoués\n`);
  if (failed > 0) process.exit(1);
}

run().catch((error) => {
  console.error('Le test a échoué :', error);
  process.exit(1);
});
