/**
 * Tests des avis et des favoris.
 *
 * Usage : backend démarré et base remplie, puis
 *   npm run test:reviews --workspace backend
 *
 * Le point central est la règle anti faux avis : un lieu réservable n'accepte
 * un avis que d'un client ayant effectivement séjourné ou participé. Le reste
 * couvre la modération, le recalcul de la note et l'idempotence des favoris.
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

async function login(email, password) {
  const response = await call('/api/auth/login', { method: 'POST', body: { email, password } });
  return response.body?.data?.token ?? '';
}

const inDays = (days) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

async function run() {
  console.log(`\nCible : ${BASE_URL}\n`);

  const adminToken = await login('admin@tourism.mr', 'Admin123!');
  const userToken = await login('touriste@example.com', 'Touriste123!');

  const hotels = await call('/api/hotels?limit=1');
  const hotel = hotels.body?.data?.items?.[0];
  const restaurants = await call('/api/restaurants?limit=1');
  const restaurant = restaurants.body?.data?.items?.[0];

  check('Un hôtel et un restaurant publiés existent', Boolean(hotel && restaurant));
  if (!hotel || !restaurant) return report();

  /* --- Règle anti faux avis --------------------------------------------------- */
  console.log('Règle anti faux avis');

  const anonymous = await call('/api/reviews', {
    method: 'POST',
    body: { targetType: 'HOTEL', targetId: hotel.id, rating: 5 },
  });
  check('Déposer un avis sans jeton → 401', anonymous.status === 401, anonymous.status);

  // Aucun séjour : l'avis doit être refusé, quelle que soit la note.
  const withoutStay = await call('/api/reviews', {
    method: 'POST',
    token: userToken,
    body: {
      targetType: 'HOTEL',
      targetId: hotel.id,
      rating: 5,
      comment: 'Séjour inventé de A à Z.',
    },
  });
  check(
    'Noter un hôtel sans y avoir séjourné → 403',
    withoutStay.status === 403,
    withoutStay.body?.error?.message,
  );

  // Un restaurant n'est pas réservable : l'avis est ouvert.
  const openReview = await call('/api/reviews', {
    method: 'POST',
    token: userToken,
    body: {
      targetType: 'RESTAURANT',
      targetId: restaurant.id,
      rating: 4,
      comment: 'Poisson grillé excellent, service rapide.',
    },
  });
  check('Noter un restaurant est ouvert → 201', openReview.status === 201, openReview.body);

  const duplicate = await call('/api/reviews', {
    method: 'POST',
    token: userToken,
    body: {
      targetType: 'RESTAURANT',
      targetId: restaurant.id,
      rating: 1,
      comment: 'Deuxième avis.',
    },
  });
  check('Un second avis sur le même lieu → 409', duplicate.status === 409, duplicate.status);

  /* --- Modération -------------------------------------------------------------- */
  console.log('\nModération');

  const reviewId = openReview.body?.data?.id;
  check(
    'Un avis démarre en attente de modération',
    openReview.body?.data?.status === 'PENDING',
    openReview.body?.data?.status,
  );

  const publicBefore = await call(`/api/reviews?targetType=RESTAURANT&targetId=${restaurant.id}`);
  check(
    'Un avis non modéré est invisible du public',
    (publicBefore.body?.data?.items ?? []).length === 0,
    publicBefore.body?.data?.meta,
  );

  const mine = await call('/api/reviews?scope=me', { token: userToken });
  check(
    'Mais son auteur le voit dans ses propres avis',
    (mine.body?.data?.items ?? []).some((item) => item.id === reviewId),
    mine.body?.data?.meta,
  );

  const userModerate = await call(`/api/reviews/${reviewId}/moderate`, {
    method: 'PATCH',
    token: userToken,
    body: { status: 'APPROVED' },
  });
  check('Un client ne peut pas modérer → 403', userModerate.status === 403, userModerate.status);

  const approved = await call(`/api/reviews/${reviewId}/moderate`, {
    method: 'PATCH',
    token: adminToken,
    body: { status: 'APPROVED' },
  });
  check('Un administrateur approuve → 200', approved.status === 200, approved.body);

  const publicAfter = await call(`/api/reviews?targetType=RESTAURANT&targetId=${restaurant.id}`);
  check(
    'L’avis approuvé devient public',
    (publicAfter.body?.data?.items ?? []).length === 1,
    publicAfter.body?.data?.meta,
  );

  /* --- Recalcul de la note ------------------------------------------------------ */
  console.log('\nNote dénormalisée');

  const afterApproval = await call(`/api/restaurants/${restaurant.id}`);
  check(
    'La note du lieu reflète l’avis approuvé',
    afterApproval.body?.data?.rating === 4 && afterApproval.body?.data?.reviewCount === 1,
    { rating: afterApproval.body?.data?.rating, count: afterApproval.body?.data?.reviewCount },
  );

  const rejected = await call(`/api/reviews/${reviewId}/moderate`, {
    method: 'PATCH',
    token: adminToken,
    body: { status: 'REJECTED', reason: 'Test de rejet' },
  });
  check('Rejet → 200', rejected.status === 200, rejected.status);

  const afterRejection = await call(`/api/restaurants/${restaurant.id}`);
  check(
    'Le rejet retire l’avis du calcul de la note',
    afterRejection.body?.data?.rating === 0 && afterRejection.body?.data?.reviewCount === 0,
    { rating: afterRejection.body?.data?.rating, count: afterRejection.body?.data?.reviewCount },
  );

  /* --- Signalement --------------------------------------------------------------- */
  console.log('\nSignalement');

  await call(`/api/reviews/${reviewId}/moderate`, {
    method: 'PATCH',
    token: adminToken,
    body: { status: 'APPROVED' },
  });

  const reported = await call(`/api/reviews/${reviewId}/report`, {
    method: 'POST',
    token: userToken,
  });
  check('Signaler un avis → 200', reported.status === 200, reported.status);

  const reportedList = await call('/api/reviews?reportedOnly=true', { token: adminToken });
  check(
    'L’avis signalé remonte dans la file de modération',
    (reportedList.body?.data?.items ?? []).some((item) => item.id === reviewId),
    reportedList.body?.data?.meta,
  );

  const stillPublic = await call(`/api/reviews?targetType=RESTAURANT&targetId=${restaurant.id}`);
  check(
    'Un signalement ne masque pas automatiquement l’avis',
    (stillPublic.body?.data?.items ?? []).length === 1,
    stillPublic.body?.data?.meta,
  );

  /* --- Avis légitime après séjour ------------------------------------------------ */
  console.log('\nAvis après séjour réel');

  const rooms = await call(`/api/hotels/${hotel.id}/rooms`);
  const room = rooms.body?.data?.items?.[0];

  const booking = await call('/api/bookings', {
    method: 'POST',
    token: userToken,
    body: { roomId: room?.id, checkIn: inDays(70), checkOut: inDays(72), guests: 1 },
  });

  const pendingReview = await call('/api/reviews', {
    method: 'POST',
    token: userToken,
    body: {
      targetType: 'HOTEL',
      targetId: hotel.id,
      rating: 5,
      comment: 'Réservation en attente.',
    },
  });
  check(
    'Une réservation en attente ne suffit pas → 403',
    pendingReview.status === 403,
    pendingReview.body?.error?.message,
  );

  await call(`/api/bookings/${booking.body?.data?.id}/confirm`, {
    method: 'PATCH',
    token: adminToken,
  });

  const legitimate = await call('/api/reviews', {
    method: 'POST',
    token: userToken,
    body: {
      targetType: 'HOTEL',
      targetId: hotel.id,
      rating: 5,
      comment: 'Séjour très agréable, personnel attentionné.',
    },
  });
  check(
    'Une réservation confirmée ouvre le droit à l’avis → 201',
    legitimate.status === 201,
    legitimate.body,
  );
  check(
    'La réservation est conservée comme justificatif',
    Boolean(legitimate.body?.data?.bookingId),
    legitimate.body?.data,
  );

  /* --- Favoris --------------------------------------------------------------------- */
  console.log('\nFavoris');

  const anonymousFavorite = await call('/api/favorites', {
    method: 'POST',
    body: { targetType: 'HOTEL', targetId: hotel.id },
  });
  check('Ajouter un favori sans jeton → 401', anonymousFavorite.status === 401);

  const added = await call('/api/favorites', {
    method: 'POST',
    token: userToken,
    body: { targetType: 'HOTEL', targetId: hotel.id },
  });
  check('Ajout d’un favori → 201', added.status === 201, added.body);

  const addedTwice = await call('/api/favorites', {
    method: 'POST',
    token: userToken,
    body: { targetType: 'HOTEL', targetId: hotel.id },
  });
  check(
    'Rajouter le même favori est idempotent',
    addedTwice.status === 201 && addedTwice.body?.data?.id === added.body?.data?.id,
    { premier: added.body?.data?.id, second: addedTwice.body?.data?.id },
  );

  const unknownTarget = await call('/api/favorites', {
    method: 'POST',
    token: userToken,
    body: { targetType: 'HOTEL', targetId: '000000000000000000000000' },
  });
  check('Un lieu inexistant → 404', unknownTarget.status === 404, unknownTarget.status);

  const list = await call('/api/favorites', { token: userToken });
  const entry = (list.body?.data?.items ?? [])[0];
  check('La liste renvoie le favori', Boolean(entry), list.body?.data?.meta);
  check(
    'Chaque favori porte sa cible, prête à afficher',
    Boolean(entry?.target?.name && entry?.target?.city),
    entry?.target,
  );

  const otherAccount = await call('/api/auth/register', {
    method: 'POST',
    body: {
      fullName: 'Curieux Favoris',
      email: `fav-${Date.now()}@example.com`,
      password: 'MotDePasse123',
    },
  });
  const otherList = await call('/api/favorites', { token: otherAccount.body?.data?.token });
  check(
    'Les favoris ne sont pas partagés entre comptes',
    (otherList.body?.data?.items ?? []).length === 0,
    otherList.body?.data?.meta,
  );

  const removed = await call(`/api/favorites?targetType=HOTEL&targetId=${hotel.id}`, {
    method: 'DELETE',
    token: userToken,
  });
  check('Retrait du favori → 200', removed.status === 200, removed.status);

  const emptied = await call('/api/favorites', { token: userToken });
  check(
    'Le favori a bien disparu',
    (emptied.body?.data?.items ?? []).length === 0,
    emptied.body?.data?.meta,
  );

  /* --- Nettoyage --------------------------------------------------------------------- */
  await call(`/api/reviews/${reviewId}`, { method: 'DELETE', token: adminToken });
  await call(`/api/reviews/${legitimate.body?.data?.id}`, { method: 'DELETE', token: adminToken });
  await call(`/api/bookings/${booking.body?.data?.id}/cancel`, {
    method: 'PATCH',
    token: userToken,
    body: {},
  });

  const restored = await call(`/api/restaurants/${restaurant.id}`);
  check(
    'La suppression d’un avis recalcule la note',
    restored.body?.data?.reviewCount === 0,
    restored.body?.data,
  );

  console.log('\n  (avis supprimés, réservation annulée)');
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
