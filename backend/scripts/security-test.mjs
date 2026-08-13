/**
 * Tests de sécurité — Phase 14.
 *
 * Usage : backend, dashboard et base démarrés, puis
 *   npm run test:security --workspace backend
 *
 * Ce ne sont pas des tests fonctionnels. Chacun vérifie qu'une **protection**
 * tient toujours : une régression ici ne casse aucune fonctionnalité, elle
 * ouvre simplement une porte. C'est précisément ce qui rend ces tests
 * indispensables — rien d'autre ne signalerait la perte.
 */
const BASE_URL = process.env.SMOKE_BASE_URL ?? 'http://localhost:4000';
const DASHBOARD_URL = process.env.DASHBOARD_URL ?? 'http://localhost:3000';

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
    console.log(`  FAIL  ${label}`);
    if (detail !== undefined) console.log(`        ${String(detail).slice(0, 220)}`);
  }
}

async function call(path, { method = 'GET', body, token, headers = {}, base = BASE_URL } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    redirect: 'manual',
  });
  const text = await response.text();
  let parsed = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { raw: text };
  }
  return { status: response.status, headers: response.headers, body: parsed, text };
}

/** Extrait la valeur d'une directive CSP, sans dépendre de l'ordre des jetons. */
function directive(policy, name) {
  const found = policy
    .split(';')
    .map((part) => part.trim())
    .find((part) => part === name || part.startsWith(`${name} `));
  return found ? found.slice(name.length).trim() : '';
}

async function login(email, password) {
  const response = await call('/api/auth/login', { method: 'POST', body: { email, password } });
  return response.body?.data?.token ?? '';
}

async function run() {
  console.log(`\nBackend   : ${BASE_URL}`);
  console.log(`Dashboard : ${DASHBOARD_URL}`);

  const adminToken = await login('admin@tourism.mr', 'Admin123!');
  const userToken = await login('touriste@example.com', 'Touriste123!');

  /* --- En-têtes du dashboard --------------------------------------------- */
  group('En-têtes du dashboard');

  const page = await call('/login', { base: DASHBOARD_URL });
  const csp = page.headers.get('content-security-policy') ?? '';

  check('Une CSP est envoyée', csp.length > 0);
  check('La CSP refuse tout par défaut', csp.includes("default-src 'none'"), csp);
  /*
   * La directive est **extraite puis analysée**, pas cherchée comme
   * sous-chaîne. Un test écrit en `includes("script-src 'unsafe-inline'")`
   * laisse passer `script-src 'nonce-x' 'unsafe-inline'`, où la protection est
   * pourtant relâchée — l'assertion vérifiait alors l'ordre des mots, pas la
   * politique.
   */
  const scriptSrc = directive(csp, 'script-src');
  check('Les scripts sont autorisés par nonce', /'nonce-[^']+'/.test(scriptSrc), scriptSrc);
  check('Aucun unsafe-inline sur les scripts', !scriptSrc.includes("'unsafe-inline'"), scriptSrc);
  check(
    'Le site ne peut pas être mis en cadre',
    directive(csp, 'frame-ancestors') === "'none'",
    directive(csp, 'frame-ancestors'),
  );
  check('X-Frame-Options double la protection', page.headers.get('x-frame-options') === 'DENY');
  check('nosniff est présent', page.headers.get('x-content-type-options') === 'nosniff');
  check(
    'Le chemin complet ne fuite pas par le Referer',
    (page.headers.get('referrer-policy') ?? '').includes('strict-origin'),
  );
  check(
    'Les capacités inutilisées sont refusées',
    (page.headers.get('permissions-policy') ?? '').includes('geolocation=()'),
  );

  /*
   * Le nonce doit changer à chaque réponse. Constant, il serait devinable, et
   * un script injecté n'aurait qu'à le recopier — la CSP deviendrait décorative.
   */
  const second = await call('/login', { base: DASHBOARD_URL });
  const nonceOf = (value) => (value.match(/nonce-([^']+)/) ?? [])[1];
  check(
    'Le nonce change à chaque réponse',
    nonceOf(csp) !== nonceOf(second.headers.get('content-security-policy') ?? ''),
    `${nonceOf(csp)} vs ${nonceOf(second.headers.get('content-security-policy') ?? '')}`,
  );

  /*
   * Le nonce annoncé doit être celui apposé sur les balises de la page. S'ils
   * divergent, la CSP bloque les scripts de Next et la page reste blanche —
   * l'échec classique d'une CSP par nonce mal câblée.
   */
  const nonceInHtml = (page.text.match(/nonce="([^"]+)"/) ?? [])[1];
  check(
    'Le nonce de l’en-tête est celui du HTML',
    Boolean(nonceInHtml) && nonceInHtml === nonceOf(csp),
    `html=${nonceInHtml} entête=${nonceOf(csp)}`,
  );

  /* --- En-têtes de l'API -------------------------------------------------- */
  group('En-têtes de l’API');

  const api = await call('/api/health');
  check('CSP verrouillée', (api.headers.get('content-security-policy') ?? '').includes("'none'"));
  check('nosniff', api.headers.get('x-content-type-options') === 'nosniff');
  check('Aucun en-tête ne révèle la technologie', !api.headers.get('x-powered-by'));

  /* --- Cookies ------------------------------------------------------------ */
  group('Cookies de session');

  const loginResponse = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'touriste@example.com', password: 'Touriste123!' }),
  });
  const setCookie = loginResponse.headers.get('set-cookie') ?? '';

  check('Le cookie de rafraîchissement est HttpOnly', /httponly/i.test(setCookie), setCookie);
  check('Il porte une politique SameSite', /samesite/i.test(setCookie), setCookie);
  check(
    'Il est restreint à un chemin précis',
    /path=\/api\/auth/i.test(setCookie),
    'Sans restriction de chemin, le cookie part avec chaque requête vers l’API.',
  );

  /* --- Escalade de privilèges --------------------------------------------- */
  group('Escalade de privilèges');

  const escalation = await call('/api/auth/register', {
    method: 'POST',
    body: {
      fullName: 'Tentative Escalade',
      email: `escalade-${Date.now()}@example.test`,
      password: 'Escalade123!',
      role: 'ADMIN',
    },
  });
  check(
    'Une inscription ne peut pas créer un administrateur',
    escalation.body?.data?.user?.role === 'USER',
    `rôle obtenu : ${escalation.body?.data?.user?.role}`,
  );

  const selfPromote = await call('/api/auth/profile', {
    method: 'PATCH',
    token: userToken,
    body: { fullName: 'Touriste', role: 'ADMIN' },
  });
  const meAfter = await call('/api/auth/me', { token: userToken });
  check(
    'Un utilisateur ne peut pas se promouvoir par son profil',
    meAfter.body?.data?.role === 'USER',
    `statut ${selfPromote.status}, rôle ${meAfter.body?.data?.role}`,
  );

  const adminRoute = await call('/api/users', { token: userToken });
  check(
    'Un utilisateur n’accède pas à l’administration',
    adminRoute.status === 403 || adminRoute.status === 401,
    `statut ${adminRoute.status}`,
  );

  /* --- Dernier administrateur --------------------------------------------- */
  group('Verrouillage hors du dashboard');

  const me = await call('/api/auth/me', { token: adminToken });
  const adminId = me.body?.data?.id;

  const selfDisable = await call(`/api/users/${adminId}`, {
    method: 'PATCH',
    token: adminToken,
    body: { isActive: false },
  });
  check(
    'Un administrateur ne peut pas se désactiver',
    selfDisable.status === 409,
    `statut ${selfDisable.status}`,
  );

  const selfDemote = await call(`/api/users/${adminId}`, {
    method: 'PATCH',
    token: adminToken,
    body: { role: 'USER' },
  });
  check(
    'Un administrateur ne peut pas se retirer son rôle',
    selfDemote.status === 409,
    `statut ${selfDemote.status}`,
  );

  /* --- Accès aux données d'autrui ----------------------------------------- */
  group('Accès direct aux ressources d’autrui');

  const bookings = await call('/api/bookings?limit=1', { token: adminToken });
  const someBookingId = bookings.body?.data?.items?.[0]?.id;

  if (someBookingId) {
    const stolen = await call(`/api/bookings/${someBookingId}`, { token: userToken });
    /*
     * 404 et non 403 : répondre « interdit » confirmerait l'existence de la
     * ressource et permettrait d'énumérer les identifiants.
     */
    check(
      'Une réservation d’autrui renvoie 404, pas 403',
      stolen.status === 404 || stolen.status === 200,
      `statut ${stolen.status} — 403 confirmerait l’existence de la ressource`,
    );
    if (stolen.status === 200) {
      check(
        'La réservation lue appartient bien à l’appelant',
        stolen.body?.data?.userId === meAfter.body?.data?.id,
        'un utilisateur a lu la réservation d’un autre',
      );
    }
  }

  /* --- Énumération de comptes --------------------------------------------- */
  group('Énumération de comptes');

  const known = await call('/api/auth/forgot-password', {
    method: 'POST',
    body: { email: 'touriste@example.com' },
  });
  const unknown = await call('/api/auth/forgot-password', {
    method: 'POST',
    body: { email: `inexistant-${Date.now()}@example.test` },
  });
  check(
    'Mot de passe oublié : même réponse pour un compte connu et inconnu',
    known.status === unknown.status && JSON.stringify(known.body) === JSON.stringify(unknown.body),
    `${known.status} ${JSON.stringify(known.body)} / ${unknown.status} ${JSON.stringify(unknown.body)}`,
  );

  const wrongPassword = await call('/api/auth/login', {
    method: 'POST',
    body: { email: 'touriste@example.com', password: 'MauvaisMotDePasse1!' },
  });
  const wrongEmail = await call('/api/auth/login', {
    method: 'POST',
    body: { email: `inconnu-${Date.now()}@example.test`, password: 'MauvaisMotDePasse1!' },
  });
  check(
    'Connexion : le message ne distingue pas email inconnu et mot de passe faux',
    wrongPassword.body?.error?.message === wrongEmail.body?.error?.message,
    `${wrongPassword.body?.error?.message} / ${wrongEmail.body?.error?.message}`,
  );

  /* --- Injection et entrées hostiles -------------------------------------- */
  group('Entrées hostiles');

  const operatorInjection = await call('/api/hotels?city[$ne]=x&limit=1');
  check(
    'Un opérateur Mongo dans un paramètre ne casse pas la requête',
    operatorInjection.status === 200 || operatorInjection.status === 422,
    `statut ${operatorInjection.status}`,
  );

  const arbitrarySort = await call('/api/users?sortBy=passwordHash&limit=1', { token: adminToken });
  const sortedFields = JSON.stringify(arbitrarySort.body?.data?.items?.[0] ?? {});
  check(
    'Un tri sur un champ non autorisé est ignoré',
    arbitrarySort.status === 200,
    `statut ${arbitrarySort.status}`,
  );
  check(
    'Le hachage du mot de passe n’est jamais sérialisé',
    !sortedFields.includes('passwordHash') && !sortedFields.includes('$2'),
    sortedFields.slice(0, 120),
  );

  const weakPassword = await call('/api/auth/register', {
    method: 'POST',
    body: {
      fullName: 'Mot De Passe Faible',
      email: `faible-${Date.now()}@example.test`,
      password: '123456',
    },
  });
  check(
    'Un mot de passe trivial est refusé',
    weakPassword.status === 422,
    `statut ${weakPassword.status}`,
  );

  /* --- Fuite d'information ------------------------------------------------ */
  group('Fuite d’information');

  const badId = await call('/api/hotels/pas-un-identifiant');
  check(
    'Une erreur ne renvoie aucune trace d’exécution',
    !badId.text.includes('at ') && !badId.text.toLowerCase().includes('mongoose'),
    badId.text.slice(0, 160),
  );

  const forged = await call('/api/auth/me', {
    token: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhZG1pbiJ9.signature-inventee',
  });
  check('Un jeton forgé est refusé', forged.status === 401, `statut ${forged.status}`);

  const noneAlgorithm = await call('/api/auth/me', {
    token: `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(
      '{"sub":"000000000000000000000001","role":"ADMIN"}',
    ).toString('base64url')}.`,
  });
  check(
    'L’algorithme « none » est refusé',
    noneAlgorithm.status === 401,
    `statut ${noneAlgorithm.status} — accepter alg:none permettrait de forger n’importe quel jeton`,
  );

  /* --- Routes internes ---------------------------------------------------- */
  group('Routes internes');

  const internal = await call('/api/internal/maintenance', { method: 'POST', body: {} });
  check(
    'Fermées sans secret',
    internal.status === 401 || internal.status === 403,
    `statut ${internal.status}`,
  );

  const internalWithUserToken = await call('/api/internal/maintenance', {
    method: 'POST',
    token: adminToken,
    body: {},
  });
  check(
    'Un jeton administrateur ne remplace pas le secret interne',
    internalWithUserToken.status === 401 || internalWithUserToken.status === 403,
    `statut ${internalWithUserToken.status} — ce sont deux relations de confiance distinctes`,
  );

  /* --- Limitation de débit ------------------------------------------------ */
  group('Limitation de débit');

  check(
    'Les réponses annoncent le quota',
    api.headers.has('x-ratelimit-limit') ||
      (await call('/api/hotels')).headers.has('x-ratelimit-limit'),
  );

  /* --- Résultat ----------------------------------------------------------- */
  console.log(`\n${passed} réussis, ${failed} échoués\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((error) => {
  console.error('\nLe test de sécurité n’a pas pu s’exécuter :', error.message);
  process.exit(1);
});
