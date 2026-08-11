/**
 * Parcours utilisateur de l'application mobile, rejoué au niveau de l'API.
 *
 * Usage : backend démarré et base remplie, puis
 *   npm run test:journey --workspace mobile
 *
 * L'application ne peut pas être pilotée sans émulateur ici. Ce script exécute
 * donc exactement la suite d'appels que font ses écrans, avec les mêmes chaînes
 * de requête et les mêmes corps — y compris la sérialisation des dates, qui
 * part d'un objet `Date` côté application. Il vérifie le contrat
 * d'intégration : si un écran cesserait de fonctionner, ce test échoue.
 */
const BASE_URL = process.env.SMOKE_BACKEND_URL ?? 'http://localhost:4000';

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

let token = null;

async function call(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  const text = await response.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { error: { message: text.slice(0, 150) } };
  }
  return { status: response.status, body };
}

/** Reproduit `toApiDate` de src/lib/format.ts. */
function toApiDate(date) {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
    .toISOString()
    .slice(0, 10);
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

async function run() {
  console.log(`\nAPI : ${BASE_URL}\n`);

  /* --- Écran d'accueil : quatre carrousels en parallèle --------------------- */
  console.log('Accueil');

  const [hotels, attractions, excursions, restaurants] = await Promise.all([
    call('/api/hotels?limit=20&sortBy=rating&sortOrder=desc'),
    call('/api/attractions?limit=20'),
    call('/api/excursions?limit=20'),
    call('/api/restaurants?limit=20'),
  ]);

  check('Les hôtels se chargent', hotels.status === 200, hotels.body);
  check('Les attractions se chargent', attractions.status === 200, attractions.body);
  check('Les excursions se chargent', excursions.status === 200, excursions.body);
  check('Les restaurants se chargent', restaurants.status === 200, restaurants.body);

  const hotelItems = hotels.body.data?.items ?? [];
  check(
    'Les fiches portent des images exploitables',
    hotelItems.some((hotel) => (hotel.images ?? []).length > 0),
    hotelItems.map((hotel) => (hotel.images ?? []).length),
  );
  check(
    'Chaque lieu porte des coordonnées GeoJSON',
    hotelItems.every(
      (hotel) => hotel.location?.type === 'Point' && Array.isArray(hotel.location.coordinates),
    ),
  );

  // Vérifie l'ordre [longitude, latitude] : une inversion placerait la
  // Mauritanie hors de ses limites réelles sans lever d'erreur.
  const firstHotel = hotelItems[0];
  if (firstHotel) {
    const [longitude, latitude] = firstHotel.location.coordinates;
    check(
      'Les coordonnées sont dans l’ordre [longitude, latitude]',
      longitude >= -18 && longitude <= -4 && latitude >= 14 && latitude <= 28,
      { longitude, latitude },
    );
  }

  /* --- Onglet Carte ---------------------------------------------------------- */
  console.log('\nCarte');

  // Cadre approximatif de la vue initiale : Nouakchott, delta de 0,25 degre.
  const region = { latitude: 18.0735, longitude: -15.9582, delta: 0.25 };
  const viewport = await call(
    `/api/map?swLat=${region.latitude - region.delta / 2}&swLng=${region.longitude - region.delta / 2}` +
      `&neLat=${region.latitude + region.delta / 2}&neLng=${region.longitude + region.delta / 2}&limit=100`,
  );
  const viewportMarkers = viewport.body.data?.markers ?? [];

  check('Le cadre visible renvoie des marqueurs', viewport.status === 200, viewport.body);
  check(
    'Les marqueurs sont bien dans le cadre demande',
    viewportMarkers.every(
      (marker) =>
        marker.latitude >= region.latitude - region.delta / 2 &&
        marker.latitude <= region.latitude + region.delta / 2 &&
        marker.longitude >= region.longitude - region.delta / 2 &&
        marker.longitude <= region.longitude + region.delta / 2,
    ),
    viewportMarkers.map((marker) => [marker.latitude, marker.longitude]),
  );
  check(
    'Chaque marqueur porte le type attendu par les filtres',
    viewportMarkers.every((marker) =>
      ['HOTEL', 'RESTAURANT', 'ATTRACTION', 'EXCURSION'].includes(marker.type),
    ),
  );

  // L'ecran decoche un type : la requete ne demande plus que les autres.
  const withoutRestaurants = await call('/api/map?types=HOTEL,ATTRACTION,EXCURSION&limit=100');
  check(
    'Decocher un filtre retire ce type des resultats',
    (withoutRestaurants.body.data?.markers ?? []).every((marker) => marker.type !== 'RESTAURANT'),
    withoutRestaurants.body.data?.countsByType,
  );

  // Bouton « centrer sur ma position ».
  const around = await call('/api/map?latitude=18.0735&longitude=-15.9582&radiusMeters=10000');
  check(
    'Le mode autour de moi trie par distance',
    (around.body.data?.markers ?? []).every(
      (marker, index, list) =>
        index === 0 || marker.distanceMeters >= list[index - 1].distanceMeters,
    ),
    (around.body.data?.markers ?? []).map((marker) => marker.distanceMeters),
  );

  // Ouverture d'une fiche depuis un marqueur.
  const hotelMarker = viewportMarkers.find((marker) => marker.type === 'HOTEL');
  if (hotelMarker) {
    const fromMarker = await call(`/api/hotels/${hotelMarker.id}`);
    check(
      'Un marqueur ouvre bien la fiche correspondante',
      fromMarker.status === 200 && fromMarker.body.data?.id === hotelMarker.id,
      fromMarker.status,
    );
  }

  /* --- Recherche depuis l'onglet Explorer ---------------------------------- */
  console.log('\nExplorer');

  const search = await call('/api/hotels?limit=20&sortBy=rating&sortOrder=desc&search=atlantique');
  check(
    'La recherche filtre les résultats',
    search.status === 200 && (search.body.data?.items ?? []).length >= 1,
    search.body,
  );

  const noResult = await call('/api/hotels?limit=20&search=zzzintrouvable');
  check(
    'Une recherche sans résultat renvoie une liste vide, pas une erreur',
    noResult.status === 200 && (noResult.body.data?.items ?? []).length === 0,
    noResult.body,
  );

  /* --- Fiche hôtel puis chambre -------------------------------------------- */
  console.log('\nFiche hôtel et chambre');

  if (!firstHotel) {
    console.log('  (aucun hôtel publié — parcours interrompu)');
    return report();
  }

  const hotelDetail = await call(`/api/hotels/${firstHotel.id}`);
  check('La fiche hôtel se charge', hotelDetail.status === 200, hotelDetail.body);

  const rooms = await call(`/api/hotels/${firstHotel.id}/rooms`);
  const roomItems = rooms.body.data?.items ?? [];
  check(
    'Les chambres de l’hôtel se chargent',
    rooms.status === 200 && roomItems.length > 0,
    rooms.body,
  );

  const room = roomItems[0];
  if (!room) return report();

  const roomDetail = await call(`/api/rooms/${room.id}`);
  check('La fiche chambre se charge', roomDetail.status === 200, roomDetail.body);

  /* --- Parcours de réservation --------------------------------------------- */
  console.log('\nRéservation');

  // Valeurs par défaut de l'écran : arrivée demain, deux nuits, deux voyageurs.
  const checkIn = addDays(new Date(), 1);
  const checkOut = addDays(checkIn, 2);

  const availability = await call(
    `/api/rooms/${room.id}/availability?checkIn=${toApiDate(checkIn)}&checkOut=${toApiDate(checkOut)}`,
  );
  const availabilityData = availability.body.data;
  check(
    'La disponibilité se consulte sans être connecté',
    availability.status === 200 && availabilityData?.nights === 2,
    availability.body,
  );

  // L'écran refuse de soumettre quand `isAvailable` est faux.
  check('La chambre est réservable sur ces dates', availabilityData?.isAvailable === true);

  const anonymous = await call('/api/bookings', {
    method: 'POST',
    body: {
      roomId: room.id,
      checkIn: new Date(toApiDate(checkIn)),
      checkOut: new Date(toApiDate(checkOut)),
      guests: 2,
    },
  });
  check(
    'Réserver sans compte renvoie 401 — l’écran redirige alors vers la connexion',
    anonymous.status === 401,
    anonymous.status,
  );

  const login = await call('/api/auth/login', {
    method: 'POST',
    body: { email: 'touriste@example.com', password: 'Touriste123!' },
  });
  token = login.body.data?.token ?? null;
  check('La connexion depuis l’application réussit', login.status === 200 && Boolean(token));

  const me = await call('/api/auth/me');
  check('La session est restaurable au démarrage', me.status === 200, me.body);

  // Corps exactement tel que le produit l'écran : des objets `Date` sérialisés
  // par `JSON.stringify`, non des chaînes « YYYY-MM-DD ».
  const booking = await call('/api/bookings', {
    method: 'POST',
    body: {
      roomId: room.id,
      checkIn: new Date(toApiDate(checkIn)),
      checkOut: new Date(toApiDate(checkOut)),
      guests: 2,
    },
  });
  const bookingData = booking.body.data;
  check(
    'La réservation aboutit avec le corps produit par l’application',
    booking.status === 201,
    booking.body,
  );
  check(
    'Le total facturé correspond au total annoncé',
    bookingData?.totalPrice === availabilityData?.totalPrice,
    { annoncé: availabilityData?.totalPrice, facturé: bookingData?.totalPrice },
  );

  /* --- Onglet Réservations -------------------------------------------------- */
  console.log('\nOnglet Réservations');

  const list = await call('/api/bookings?limit=50');
  check(
    'La réservation apparaît dans la liste',
    (list.body.data?.items ?? []).some((item) => item.id === bookingData?.id),
    list.body.data?.meta,
  );

  if (bookingData) {
    const detail = await call(`/api/bookings/${bookingData.id}`);
    check('Le détail de la réservation se charge', detail.status === 200, detail.body);

    const cancelled = await call(`/api/bookings/${bookingData.id}/cancel`, {
      method: 'PATCH',
      body: {},
    });
    check(
      'L’annulation depuis l’application fonctionne',
      cancelled.status === 200 && cancelled.body.data?.status === 'CANCELLED',
      cancelled.body,
    );

    // Après annulation, l'unité est libérée : l'écran de réservation doit à
    // nouveau proposer la chambre.
    const afterCancel = await call(
      `/api/rooms/${room.id}/availability?checkIn=${toApiDate(checkIn)}&checkOut=${toApiDate(checkOut)}`,
    );
    check(
      'L’annulation libère la chambre',
      afterCancel.body.data?.bookedUnits === availabilityData?.bookedUnits,
      { avant: availabilityData?.bookedUnits, après: afterCancel.body.data?.bookedUnits },
    );
  }

  report();
}

function report() {
  console.log(`\n${passed} réussis, ${failed} échoués\n`);
  if (failed > 0) process.exit(1);
}

run().catch((error) => {
  console.error('Le parcours a échoué :', error);
  process.exit(1);
});
