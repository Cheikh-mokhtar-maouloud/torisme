/**
 * Test de fumée de l'API.
 *
 * Usage : démarrer le serveur (`npm run dev` ou `npm start`), lancer le seed,
 * puis `npm run smoke --workspace backend`.
 *
 * Il ne remplace pas une suite de tests unitaires (Phase 8 pour la logique de
 * réservation) : il vérifie que le contrat HTTP tient de bout en bout —
 * autorisation, validation, filtrage et pagination — contre une vraie base.
 */
const BASE_URL = process.env.SMOKE_BASE_URL ?? 'http://localhost:4000';

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail?: unknown): void {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${label}`);
    if (detail !== undefined) console.log(`        ${JSON.stringify(detail).slice(0, 300)}`);
  }
}

interface ApiCall {
  status: number;
  body: {
    success?: boolean;
    data?: Record<string, unknown> & {
      items?: unknown[];
      meta?: Record<string, unknown>;
      user?: Record<string, unknown>;
    };
    error?: { code?: string; message?: string; fields?: Record<string, string[]> };
  };
}

async function call(
  path: string,
  options: { method?: string; body?: unknown; token?: string } = {},
): Promise<ApiCall> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });

  const text = await response.text();
  let body: ApiCall['body'] = {};
  try {
    body = JSON.parse(text);
  } catch {
    body = { error: { message: text.slice(0, 200) } };
  }

  return { status: response.status, body };
}

/** Récupère uniquement les en-têtes d'une réponse, sans lire le corps. */
async function rawHeaders(path: string, extra: Record<string, string> = {}): Promise<Headers> {
  const response = await fetch(`${BASE_URL}${path}`, { headers: extra });
  await response.text();
  return response.headers;
}

async function run(): Promise<void> {
  console.log(`\nCible : ${BASE_URL}\n`);

  /* --- Santé -------------------------------------------------------------- */
  console.log('Santé');
  const health = await call('/api/health');
  check('GET /api/health → 200', health.status === 200, health.body);

  const deepHealth = await call('/api/health?deep=true');
  check(
    'GET /api/health?deep=true signale MongoDB connecté',
    deepHealth.status === 200 &&
      (deepHealth.body.data?.dependencies as Record<string, { state: string }>)?.mongodb?.state ===
        'connected',
    deepHealth.body,
  );

  /* --- En-têtes de sécurité et CORS ---------------------------------------- */
  console.log('\nEn-têtes de sécurité et CORS');

  const headers = await rawHeaders('/api/health');
  check('X-Content-Type-Options: nosniff', headers.get('x-content-type-options') === 'nosniff');
  check('X-Frame-Options: DENY', headers.get('x-frame-options') === 'DENY');
  check(
    'Content-Security-Policy verrouillée',
    (headers.get('content-security-policy') ?? '').includes("default-src 'none'"),
    headers.get('content-security-policy'),
  );

  const allowedOrigin = await rawHeaders('/api/health', { Origin: 'http://localhost:3000' });
  check(
    'Une origine autorisée reçoit Access-Control-Allow-Origin',
    allowedOrigin.get('access-control-allow-origin') === 'http://localhost:3000',
    allowedOrigin.get('access-control-allow-origin'),
  );
  check(
    'Vary: Origin est présent (sécurité des caches)',
    (allowedOrigin.get('vary') ?? '').toLowerCase().includes('origin'),
  );

  const deniedOrigin = await rawHeaders('/api/health', { Origin: 'https://evil.example' });
  check(
    'Une origine inconnue ne reçoit aucun en-tête CORS',
    deniedOrigin.get('access-control-allow-origin') === null,
    deniedOrigin.get('access-control-allow-origin'),
  );

  const preflight = await fetch(`${BASE_URL}/api/hotels`, {
    method: 'OPTIONS',
    headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' },
  });
  check('Préflight d’une origine inconnue → 403', preflight.status === 403, preflight.status);

  /* --- Authentification ---------------------------------------------------- */
  console.log('\nAuthentification');
  const badLogin = await call('/api/auth/login', {
    method: 'POST',
    body: { email: 'admin@tourism.mr', password: 'mauvais-mot-de-passe' },
  });
  check('Mot de passe incorrect → 401', badLogin.status === 401, badLogin.body);

  // Tentative d'injection d'opérateur MongoDB : sans validation, `{$ne: null}`
  // ferait correspondre le premier utilisateur venu.
  const injection = await call('/api/auth/login', {
    method: 'POST',
    body: { email: { $ne: null }, password: { $ne: null } },
  });
  check('Injection d’opérateur MongoDB rejetée → 422', injection.status === 422, injection.body);

  const adminLogin = await call('/api/auth/login', {
    method: 'POST',
    body: { email: 'admin@tourism.mr', password: 'Admin123!' },
  });
  check('Connexion admin → 200', adminLogin.status === 200, adminLogin.body);

  const adminToken = adminLogin.body.data?.token as string | undefined;
  check('Un jeton est renvoyé', typeof adminToken === 'string' && adminToken.length > 20);
  check(
    'Le hash du mot de passe n’est jamais exposé',
    !JSON.stringify(adminLogin.body).includes('passwordHash'),
  );

  const userLogin = await call('/api/auth/login', {
    method: 'POST',
    body: { email: 'touriste@example.com', password: 'Touriste123!' },
  });
  const userToken = userLogin.body.data?.token as string | undefined;
  check('Connexion touriste → 200', userLogin.status === 200, userLogin.body);

  const me = await call('/api/auth/me', { token: adminToken });
  check(
    'GET /api/auth/me renvoie le rôle ADMIN',
    me.status === 200 && me.body.data?.role === 'ADMIN',
    me.body,
  );

  const meAnonymous = await call('/api/auth/me');
  check('GET /api/auth/me sans jeton → 401', meAnonymous.status === 401, meAnonymous.body);

  const duplicate = await call('/api/auth/register', {
    method: 'POST',
    body: { fullName: 'Doublon', email: 'admin@tourism.mr', password: 'MotDePasse123' },
  });
  check('Inscription avec un email existant → 409', duplicate.status === 409, duplicate.body);

  const weakPassword = await call('/api/auth/register', {
    method: 'POST',
    body: { fullName: 'Test', email: 'nouveau@example.com', password: 'court' },
  });
  check('Mot de passe trop court → 422', weakPassword.status === 422, weakPassword.body);

  // Une inscription publique ne doit jamais produire un administrateur.
  const escalation = await call('/api/auth/register', {
    method: 'POST',
    body: {
      fullName: 'Escalade',
      email: `escalade-${Date.now()}@example.com`,
      password: 'MotDePasse123',
      role: 'ADMIN',
    },
  });
  check(
    'Le champ `role` envoyé à l’inscription est ignoré',
    escalation.status === 201 && escalation.body.data?.user?.role === 'USER',
    escalation.body,
  );

  /* --- Lecture publique ---------------------------------------------------- */
  console.log('\nLecture publique');
  const hotels = await call('/api/hotels');
  const hotelItems = hotels.body.data?.items ?? [];
  check('GET /api/hotels → 200', hotels.status === 200, hotels.body);
  check(
    'Seuls les hôtels publiés sont listés (2 sur 3)',
    hotelItems.length === 2,
    hotelItems.map((h) => (h as { name: string }).name),
  );
  check(
    'Les métadonnées de pagination sont présentes',
    typeof hotels.body.data?.meta?.totalPages === 'number',
    hotels.body.data?.meta,
  );

  const draftHotel = (await call('/api/hotels?status=DRAFT', { token: adminToken })).body.data
    ?.items?.[0] as { id: string } | undefined;
  check('Un admin voit les brouillons', draftHotel !== undefined);

  if (draftHotel) {
    const draftAsPublic = await call(`/api/hotels/${draftHotel.id}`);
    check(
      'Un brouillon est introuvable pour le public → 404',
      draftAsPublic.status === 404,
      draftAsPublic.body,
    );

    const draftAsAdmin = await call(`/api/hotels/${draftHotel.id}`, { token: adminToken });
    check('Un brouillon est visible par un admin → 200', draftAsAdmin.status === 200);
  }

  const firstHotel = hotelItems[0] as { id: string; minPricePerNight?: number } | undefined;
  check(
    'Le prix minimum dénormalisé est calculé',
    typeof firstHotel?.minPricePerNight === 'number',
    firstHotel,
  );

  if (firstHotel) {
    const rooms = await call(`/api/hotels/${firstHotel.id}/rooms`);
    check(
      'GET /api/hotels/:id/rooms renvoie les chambres',
      rooms.status === 200 && (rooms.body.data?.items?.length ?? 0) > 0,
      rooms.body,
    );
  }

  const geo = await call('/api/hotels?latitude=18.0735&longitude=-15.9582&radiusMeters=20000');
  check(
    'Recherche géographique → 200 avec résultats proches',
    geo.status === 200 && (geo.body.data?.items?.length ?? 0) >= 1,
    geo.body,
  );

  const geoIncomplete = await call('/api/hotels?latitude=18.07');
  check('Latitude sans longitude → 422', geoIncomplete.status === 422, geoIncomplete.body);

  const search = await call('/api/hotels?search=atlantique');
  check(
    'Recherche plein texte → au moins un résultat',
    search.status === 200 && (search.body.data?.items?.length ?? 0) >= 1,
    search.body,
  );

  const excursions = await call('/api/excursions');
  const excursionItems = excursions.body.data?.items ?? [];
  check(
    'Les excursions passées sont exclues par défaut',
    excursions.status === 200 &&
      excursionItems.length === 2 &&
      !excursionItems.some((e) => (e as { title: string }).title.includes('passée')),
    excursionItems.map((e) => (e as { title: string }).title),
  );

  const restaurants = await call('/api/restaurants');
  check(
    'GET /api/restaurants → 2 fiches publiées',
    restaurants.status === 200 && (restaurants.body.data?.items?.length ?? 0) === 2,
    restaurants.body,
  );

  const attractions = await call('/api/attractions?freeOnly=true');
  check(
    'Filtre « gratuit » sur les attractions → 1 résultat',
    attractions.status === 200 && (attractions.body.data?.items?.length ?? 0) === 1,
    attractions.body.data?.items,
  );

  const categories = await call('/api/categories?appliesTo=RESTAURANT');
  check(
    'GET /api/categories filtré par type → 2 résultats',
    categories.status === 200 && (categories.body.data?.items?.length ?? 0) === 2,
    categories.body,
  );

  const limitTooHigh = await call('/api/hotels?limit=5000');
  check('limit au-delà du maximum → 422', limitTooHigh.status === 422, limitTooHigh.body);

  const badId = await call('/api/hotels/pas-un-objectid');
  check('Identifiant malformé → 422', badId.status === 422, badId.body);

  const missing = await call('/api/hotels/000000000000000000000000');
  check('Identifiant inexistant → 404', missing.status === 404, missing.body);

  /* --- Carte ---------------------------------------------------------------- */
  console.log('\nCarte');

  const map = await call('/api/map');
  const mapData = map.body.data as
    | {
        markers?: Array<{
          type: string;
          latitude: number;
          longitude: number;
          name: string;
          distanceMeters?: number;
        }>;
        countsByType?: Record<string, number>;
        truncated?: boolean;
      }
    | undefined;

  check('GET /api/map est public → 200', map.status === 200, map.body);
  check(
    'Les quatre types de lieux sont représentés',
    Object.keys(mapData?.countsByType ?? {}).length === 4,
    mapData?.countsByType,
  );
  check(
    'Chaque marqueur porte des coordonnées nommées',
    (mapData?.markers ?? []).every(
      (marker) => typeof marker.latitude === 'number' && typeof marker.longitude === 'number',
    ),
  );
  check(
    'Les coordonnées restent dans les limites de la Mauritanie',
    (mapData?.markers ?? []).every(
      (marker) =>
        marker.latitude >= 14 &&
        marker.latitude <= 28 &&
        marker.longitude >= -18 &&
        marker.longitude <= -4,
    ),
    (mapData?.markers ?? []).slice(0, 2),
  );

  // Mode « autour de moi » : $geoNear expose la distance et trie dessus.
  const nearby = await call('/api/map?latitude=18.0735&longitude=-15.9582&radiusMeters=20000');
  const nearbyMarkers =
    (nearby.body.data as { markers?: Array<{ distanceMeters?: number }> } | undefined)?.markers ??
    [];

  check('Recherche par proximité → 200', nearby.status === 200, nearby.body);
  check(
    'Chaque marqueur porte sa distance',
    nearbyMarkers.length > 0 &&
      nearbyMarkers.every((marker) => typeof marker.distanceMeters === 'number'),
    nearbyMarkers.slice(0, 2),
  );
  check(
    'Les marqueurs sont triés par distance croissante, tous types confondus',
    nearbyMarkers.every(
      (marker, index) =>
        index === 0 ||
        (marker.distanceMeters ?? 0) >= (nearbyMarkers[index - 1]?.distanceMeters ?? 0),
    ),
    nearbyMarkers.map((marker) => marker.distanceMeters),
  );
  check(
    'Le rayon est respecté',
    nearbyMarkers.every((marker) => (marker.distanceMeters ?? 0) <= 20_000),
  );

  // Cadre visible : ne renvoie que ce qui s'y trouve.
  const inBounds = await call('/api/map?swLat=20.3&swLng=-12.5&neLat=20.6&neLng=-12.2');
  const boundedMarkers =
    (inBounds.body.data as { markers?: Array<{ name: string }> } | undefined)?.markers ?? [];
  check(
    'Le cadre visible isole les lieux concernés',
    inBounds.status === 200 &&
      boundedMarkers.length === 1 &&
      (boundedMarkers[0]?.name ?? '').includes('Chinguetti'),
    boundedMarkers.map((marker) => marker.name),
  );

  const filtered = await call('/api/map?types=HOTEL,EXCURSION');
  const filteredCounts =
    (filtered.body.data as { countsByType?: Record<string, number> } | undefined)?.countsByType ??
    {};
  check(
    'Le filtre par type exclut les autres',
    !('RESTAURANT' in filteredCounts) && !('ATTRACTION' in filteredCounts),
    filteredCounts,
  );

  const partialBounds = await call('/api/map?swLat=20.3&swLng=-12.5');
  check('Un cadre incomplet → 422', partialBounds.status === 422, partialBounds.status);

  const invertedBounds = await call('/api/map?swLat=21&swLng=-12.5&neLat=20.3&neLng=-12.2');
  check('Un cadre inversé → 422', invertedBounds.status === 422, invertedBounds.status);

  const lonelyLatitude = await call('/api/map?latitude=18.07');
  check('Latitude sans longitude → 422', lonelyLatitude.status === 422, lonelyLatitude.status);

  /* --- Réservations --------------------------------------------------------- */
  console.log('\nRéservations');

  const roomsForBooking = await call('/api/rooms?limit=1');
  const bookableRoom = roomsForBooking.body.data?.items?.[0] as
    { id: string; capacity: number; pricePerNight: number } | undefined;
  check('Une chambre publiée est disponible pour le test', bookableRoom !== undefined);

  if (bookableRoom) {
    const dayAfter = (days: number) =>
      new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

    const checkIn = dayAfter(10);
    const checkOut = dayAfter(13);

    const availability = await call(
      `/api/rooms/${bookableRoom.id}/availability?checkIn=${checkIn}&checkOut=${checkOut}`,
    );
    const availabilityData = availability.body.data as
      { nights: number; totalPrice: number; isAvailable: boolean; unitPrice: number } | undefined;

    check(
      'La disponibilité est publique et calcule les nuits',
      availability.status === 200 && availabilityData?.nights === 3,
      availability.body,
    );
    check(
      'Le prix total est calculé par le serveur',
      availabilityData?.totalPrice === bookableRoom.pricePerNight * 3,
      { attendu: bookableRoom.pricePerNight * 3, reçu: availabilityData?.totalPrice },
    );

    const badRange = await call(
      `/api/rooms/${bookableRoom.id}/availability?checkIn=${checkOut}&checkOut=${checkIn}`,
    );
    check('Une plage de dates inversée → 422', badRange.status === 422, badRange.body);

    const anonymousBooking = await call('/api/bookings', {
      method: 'POST',
      body: { roomId: bookableRoom.id, checkIn, checkOut, guests: 2 },
    });
    check('Réserver sans jeton → 401', anonymousBooking.status === 401, anonymousBooking.body);

    const pastBooking = await call('/api/bookings', {
      method: 'POST',
      body: { roomId: bookableRoom.id, checkIn: dayAfter(-5), checkOut: dayAfter(-2), guests: 1 },
      token: userToken,
    });
    check('Réserver dans le passé → 422', pastBooking.status === 422, pastBooking.body);

    const tooManyGuests = await call('/api/bookings', {
      method: 'POST',
      body: { roomId: bookableRoom.id, checkIn, checkOut, guests: bookableRoom.capacity + 5 },
      token: userToken,
    });
    check(
      'Dépasser la capacité de la chambre → 422',
      tooManyGuests.status === 422,
      tooManyGuests.body,
    );

    const booking = await call('/api/bookings', {
      method: 'POST',
      body: { roomId: bookableRoom.id, checkIn, checkOut, guests: 2 },
      token: userToken,
    });
    const bookingData = booking.body.data as
      | { id: string; reference: string; totalPrice: number; nights: number; status: string }
      | undefined;

    check('Créer une réservation → 201', booking.status === 201, booking.body);
    check(
      'Le prix enregistré est celui calculé par le serveur',
      bookingData?.totalPrice === bookableRoom.pricePerNight * 3 && bookingData?.nights === 3,
      bookingData,
    );
    check(
      'La réservation démarre en attente avec une référence',
      bookingData?.status === 'PENDING' && (bookingData?.reference ?? '').startsWith('TP-'),
      bookingData,
    );

    if (bookingData) {
      const mine = await call('/api/bookings', { token: userToken });
      check(
        'La réservation apparaît dans l’historique du client',
        (mine.body.data?.items ?? []).some(
          (item) => (item as { id: string }).id === bookingData.id,
        ),
        mine.body.data?.meta,
      );

      // Contrôle de propriété : un autre compte authentifié ne doit pas y accéder.
      const otherUser = await call('/api/auth/register', {
        method: 'POST',
        body: {
          fullName: 'Curieux',
          email: `curieux-${Date.now()}@example.com`,
          password: 'MotDePasse123',
        },
      });
      const otherToken = otherUser.body.data?.token as string | undefined;

      const stolen = await call(`/api/bookings/${bookingData.id}`, { token: otherToken });
      check(
        'Un autre utilisateur ne peut pas lire la réservation → 404',
        stolen.status === 404,
        stolen.status,
      );

      const otherList = await call('/api/bookings', { token: otherToken });
      check(
        'Un autre utilisateur ne voit pas la réservation dans sa liste',
        (otherList.body.data?.items ?? []).length === 0,
        otherList.body.data?.meta,
      );

      const cancelled = await call(`/api/bookings/${bookingData.id}/cancel`, {
        method: 'PATCH',
        body: {},
        token: userToken,
      });
      check(
        'Annuler sa réservation → 200 avec statut CANCELLED',
        cancelled.status === 200 &&
          (cancelled.body.data as { status?: string } | undefined)?.status === 'CANCELLED',
        cancelled.body,
      );

      const doubleCancel = await call(`/api/bookings/${bookingData.id}/cancel`, {
        method: 'PATCH',
        body: {},
        token: userToken,
      });
      check('Annuler deux fois → 409', doubleCancel.status === 409, doubleCancel.status);
    }
  }

  /* --- Autorisation des écritures ------------------------------------------ */
  console.log('\nAutorisation des écritures');
  const payload = {
    name: 'Hôtel de test smoke',
    description: 'Fiche créée par le test de fumée, supprimée à la fin du scénario.',
    address: { city: 'Nouakchott', country: 'Mauritanie', countryCode: 'MR' },
    location: { type: 'Point', coordinates: [-15.96, 18.08] },
    currency: 'MRU',
    status: 'PUBLISHED',
  };

  const anonymousCreate = await call('/api/hotels', { method: 'POST', body: payload });
  check('POST /api/hotels sans jeton → 401', anonymousCreate.status === 401, anonymousCreate.body);

  const userCreate = await call('/api/hotels', {
    method: 'POST',
    body: payload,
    token: userToken,
  });
  check('POST /api/hotels avec un rôle USER → 403', userCreate.status === 403, userCreate.body);

  const invalidCreate = await call('/api/hotels', {
    method: 'POST',
    body: { ...payload, name: 'x', location: { type: 'Point', coordinates: [200, 100] } },
    token: adminToken,
  });
  check(
    'Coordonnées hors limites rejetées → 422',
    invalidCreate.status === 422,
    invalidCreate.body.error?.fields,
  );

  const adminCreate = await call('/api/hotels', {
    method: 'POST',
    body: payload,
    token: adminToken,
  });
  check('POST /api/hotels en admin → 201', adminCreate.status === 201, adminCreate.body);
  const createdId = adminCreate.body.data?.id as string | undefined;

  if (createdId) {
    // Les champs dérivés ne figurent pas dans le schéma d'entrée : Zod les
    // ignore silencieusement plutôt que de les écrire en base.
    const tamper = await call(`/api/hotels/${createdId}`, {
      method: 'PUT',
      body: { rating: 5, reviewCount: 9999, minPricePerNight: 1 },
      token: adminToken,
    });
    check(
      'Les champs dérivés envoyés par le client sont ignorés',
      tamper.status === 200 &&
        tamper.body.data?.rating === 0 &&
        tamper.body.data?.reviewCount === 0,
      { rating: tamper.body.data?.rating, reviewCount: tamper.body.data?.reviewCount },
    );

    const update = await call(`/api/hotels/${createdId}`, {
      method: 'PUT',
      body: { stars: 5 },
      token: adminToken,
    });
    check(
      'PUT /api/hotels/:id met à jour',
      update.status === 200 && update.body.data?.stars === 5,
      update.body,
    );

    const removal = await call(`/api/hotels/${createdId}`, {
      method: 'DELETE',
      token: adminToken,
    });
    check('DELETE /api/hotels/:id → 200', removal.status === 200, removal.body);

    const afterRemoval = await call(`/api/hotels/${createdId}`, { token: adminToken });
    check('L’hôtel supprimé n’est plus accessible → 404', afterRemoval.status === 404);
  }

  // Un hôtel ayant des chambres publiées ne doit pas pouvoir être supprimé.
  if (firstHotel) {
    const protectedDelete = await call(`/api/hotels/${firstHotel.id}`, {
      method: 'DELETE',
      token: adminToken,
    });
    check(
      'Suppression refusée si des chambres sont publiées → 409',
      protectedDelete.status === 409,
      protectedDelete.body,
    );
  }

  /* --- Résultat ------------------------------------------------------------ */
  console.log(`\n${passed} réussis, ${failed} échoués\n`);
  if (failed > 0) process.exit(1);
}

run().catch((error: unknown) => {
  console.error('Le test de fumée a échoué :', error);
  process.exit(1);
});
