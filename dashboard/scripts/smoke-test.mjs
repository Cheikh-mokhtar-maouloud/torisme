/**
 * Test de fumée du dashboard.
 *
 * Usage : backend et dashboard démarrés, base remplie par le seed, puis
 *   npm run smoke --workspace dashboard
 *
 * Il vérifie ce qu'un test d'API ne couvre pas : la protection des routes, la
 * session portée par le cookie du dashboard, et le fait que chaque page se
 * rende réellement avec les données du backend.
 */
const DASHBOARD = process.env.SMOKE_DASHBOARD_URL ?? 'http://localhost:3000';
const BACKEND = process.env.SMOKE_BACKEND_URL ?? 'http://localhost:4000';

let passed = 0;
let failed = 0;

function check(label, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${label}`);
    if (detail !== undefined) console.log(`        ${String(detail).slice(0, 300)}`);
  }
}

let sessionCookie = '';

async function visit(path, options = {}) {
  const response = await fetch(`${DASHBOARD}${path}`, {
    redirect: 'manual',
    headers: sessionCookie ? { Cookie: sessionCookie } : {},
    ...options,
  });
  const body = await response.text();
  return { status: response.status, location: response.headers.get('location'), body };
}

async function run() {
  console.log(`\nDashboard : ${DASHBOARD}\nBackend   : ${BACKEND}\n`);

  /* --- Routes protégées, session absente ---------------------------------- */
  console.log('Protection des routes');
  for (const path of ['/', '/hotels', '/users', '/settings', '/categories']) {
    const page = await visit(path);
    check(
      `${path} sans session → redirection vers /login`,
      page.status === 307 && (page.location ?? '').includes('/login'),
      `${page.status} ${page.location}`,
    );
  }

  const loginPage = await visit('/login');
  check('/login accessible sans session', loginPage.status === 200);
  check(
    'Le formulaire de connexion est rendu',
    loginPage.body.includes('Se connecter') && loginPage.body.includes('Administration'),
  );

  /* --- Session d'un compte non administrateur ------------------------------ */
  console.log('\nCloisonnement des rôles');
  const touristToken = await fetchToken('touriste@example.com', 'Touriste123!');
  check('Le backend délivre un jeton au compte touriste', Boolean(touristToken));

  sessionCookie = `dashboard_session=${touristToken}`;
  const asTourist = await visit('/hotels');
  check(
    'Un jeton USER ne donne pas accès au dashboard',
    asTourist.status === 307 && (asTourist.location ?? '').includes('/login'),
    `${asTourist.status} ${asTourist.location}`,
  );

  /* --- Session administrateur ---------------------------------------------- */
  console.log('\nSession administrateur');
  const adminToken = await fetchToken('admin@tourism.mr', 'Admin123!');
  check('Le backend délivre un jeton à l’administrateur', Boolean(adminToken));
  sessionCookie = `dashboard_session=${adminToken}`;

  const home = await visit('/');
  check('Tableau de bord → 200', home.status === 200, `${home.status} ${home.location}`);
  check('Les compteurs sont affichés', home.body.includes('Tableau de bord'));
  check(
    'Le jeton n’apparaît pas dans le HTML rendu',
    !home.body.includes(adminToken),
    'fuite du jeton dans la page',
  );

  const pages = [
    ['/hotels', 'Hôtel Atlantique Nouakchott'],
    ['/rooms', 'Chambre Double Vue Mer'],
    ['/restaurants', 'Le Petit Poisson'],
    ['/attractions', 'Chinguetti'],
    ['/excursions', 'Train du désert'],
    ['/users', 'admin@tourism.mr'],
    ['/categories', 'fruits-de-mer'],
    ['/settings', 'connected'],
  ];

  for (const [path, expected] of pages) {
    const page = await visit(path);
    check(
      `${path} → 200 avec ses données`,
      page.status === 200 && page.body.includes(expected),
      `${page.status} — « ${expected} » absent`,
    );
  }

  /* --- Visibilité des brouillons ------------------------------------------- */
  console.log('\nVisibilité et filtres');
  const drafts = await visit('/hotels?status=DRAFT');
  check(
    'Un administrateur voit les brouillons',
    drafts.status === 200 && drafts.body.includes('Résidence Chinguetti'),
  );

  const published = await visit('/hotels?status=PUBLISHED');
  check(
    'Le filtre « publié » exclut les brouillons',
    published.status === 200 && !published.body.includes('Résidence Chinguetti'),
  );

  const search = await visit('/hotels?search=atlantique');
  check(
    'La recherche filtre la liste',
    search.status === 200 &&
      search.body.includes('Atlantique') &&
      !search.body.includes('Auberge du Banc'),
  );

  const emptySearch = await visit('/hotels?search=zzzzintrouvable');
  check(
    'Une recherche sans résultat affiche l’état vide',
    emptySearch.status === 200 && emptySearch.body.includes('Aucun hôtel'),
  );

  /* --- Pages de détail et d'édition ---------------------------------------- */
  console.log('\nDétail et édition');
  const hotelId = await fetchFirstHotelId(adminToken);
  check('Un identifiant d’hôtel est récupérable', Boolean(hotelId));

  if (hotelId) {
    const detail = await visit(`/hotels/${hotelId}`);
    check(
      'La fiche détail affiche les chambres rattachées',
      detail.status === 200 && detail.body.includes('Chambres'),
    );

    const edit = await visit(`/hotels/${hotelId}/edit`);
    check(
      'Le formulaire d’édition est prérempli',
      edit.status === 200 && edit.body.includes('Modifier'),
    );
  }

  const missing = await visit('/hotels/000000000000000000000000');
  check('Un hôtel inexistant → 404', missing.status === 404, missing.status);

  const malformed = await visit('/hotels/pas-un-id');
  check('Un identifiant malformé → 404', malformed.status === 404, malformed.status);

  /* --- Résultat ------------------------------------------------------------- */
  console.log(`\n${passed} réussis, ${failed} échoués\n`);
  if (failed > 0) process.exit(1);
}

async function fetchToken(email, password) {
  const response = await fetch(`${BACKEND}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const payload = await response.json();
  return payload?.data?.token ?? '';
}

async function fetchFirstHotelId(token) {
  const response = await fetch(`${BACKEND}/api/hotels?limit=1`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const payload = await response.json();
  return payload?.data?.items?.[0]?.id ?? '';
}

run().catch((error) => {
  console.error('Le test de fumée a échoué :', error);
  process.exit(1);
});
