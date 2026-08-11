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

/* eslint-disable no-console -- script de test, sortie destinée au terminal */

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
