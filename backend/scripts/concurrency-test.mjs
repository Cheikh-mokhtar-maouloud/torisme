/**
 * Test de concurrence sur la réservation.
 *
 * Usage : backend démarré et base remplie, puis
 *   npm run test:concurrency --workspace backend
 *
 * C'est le test qui justifie le verrou de `lib/room-lock.ts`. Il crée une
 * chambre à **une seule unité**, lance N réservations simultanées sur les mêmes
 * dates, et vérifie qu'exactement une aboutit.
 *
 * Sans verrou, plusieurs réussissent : la fenêtre entre le comptage des
 * chevauchements et l'insertion est courte mais réelle, et des requêtes
 * parallèles la traversent ensemble.
 */
const BASE_URL = process.env.SMOKE_BASE_URL ?? 'http://localhost:4000';
const CONCURRENT_REQUESTS = 12;

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

const inDays = (days) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

async function run() {
  console.log(`\nCible : ${BASE_URL}\n`);

  const adminToken = await login('admin@tourism.mr', 'Admin123!');
  const userToken = await login('touriste@example.com', 'Touriste123!');

  /* --- Chambre dédiée, une seule unité -------------------------------------- */
  console.log('Préparation');

  const hotels = await call('/api/hotels?limit=1');
  const hotel = hotels.body?.data?.items?.[0];
  check('Un hôtel publié est disponible', Boolean(hotel), hotels.body);
  if (!hotel) return report();

  const room = await call('/api/rooms', {
    method: 'POST',
    token: adminToken,
    body: {
      hotelId: hotel.id,
      name: `Chambre unique (test ${Date.now()})`,
      description: 'Chambre créée pour le test de concurrence, supprimée à la fin.',
      capacity: 2,
      bedCount: 1,
      pricePerNight: 10_000,
      currency: 'MRU',
      totalUnits: 1,
      status: 'PUBLISHED',
    },
  });
  const roomId = room.body?.data?.id;
  check('Chambre à une unité créée', room.status === 201, room.body);
  if (!roomId) return report();

  const checkIn = inDays(45);
  const checkOut = inDays(47);

  /* --- Assaut simultané ------------------------------------------------------ */
  console.log(`\nConcurrence — ${CONCURRENT_REQUESTS} réservations simultanées, 1 unité`);

  // `Promise.all` sur des requêtes déjà lancées : elles partent ensemble, ce qui
  // maximise le recouvrement des sections critiques.
  const attempts = Array.from({ length: CONCURRENT_REQUESTS }, () =>
    call('/api/bookings', {
      method: 'POST',
      token: userToken,
      body: { roomId, checkIn, checkOut, guests: 1 },
    }),
  );

  const results = await Promise.all(attempts);

  const accepted = results.filter((result) => result.status === 201);
  const conflicts = results.filter((result) => result.status === 409);
  const unexpected = results.filter((result) => result.status !== 201 && result.status !== 409);

  check(
    'Exactement une réservation aboutit',
    accepted.length === 1,
    `acceptées=${accepted.length} conflits=${conflicts.length} autres=${unexpected.length}`,
  );
  check(
    'Toutes les autres sont refusées proprement (409)',
    conflicts.length === CONCURRENT_REQUESTS - 1,
    results.map((result) => result.status),
  );
  check(
    'Aucune erreur serveur',
    unexpected.length === 0,
    unexpected.map((result) => ({ status: result.status, body: result.body })),
  );

  /* --- État final ------------------------------------------------------------- */
  console.log('\nÉtat après l’assaut');

  const availability = await call(
    `/api/rooms/${roomId}/availability?checkIn=${checkIn}&checkOut=${checkOut}`,
  );
  check(
    'La chambre est comptée comme occupée une seule fois',
    availability.body?.data?.bookedUnits === 1,
    availability.body?.data,
  );
  check(
    'Elle n’est plus disponible',
    availability.body?.data?.isAvailable === false,
    availability.body?.data,
  );

  const noLockLeft = await call('/api/bookings', {
    method: 'POST',
    token: userToken,
    body: { roomId, checkIn: inDays(60), checkOut: inDays(61), guests: 1 },
  });
  check(
    'Le verrou est bien relâché — une autre période reste réservable',
    noLockLeft.status === 201,
    noLockLeft.body,
  );

  /* --- Nettoyage --------------------------------------------------------------- */
  const created = [...accepted, noLockLeft].map((result) => result.body?.data?.id).filter(Boolean);

  for (const bookingId of created) {
    await call(`/api/bookings/${bookingId}/cancel`, {
      method: 'PATCH',
      body: {},
      token: userToken,
    });
  }
  await call(`/api/rooms/${roomId}`, { method: 'DELETE', token: adminToken });
  console.log(`\n  (${created.length} réservation(s) annulée(s), chambre de test supprimée)`);

  report();
}

function report() {
  console.log(`\n${passed} réussis, ${failed} échoués\n`);
  if (failed > 0) process.exit(1);
}

run().catch((error) => {
  console.error('Le test de concurrence a échoué :', error);
  process.exit(1);
});
