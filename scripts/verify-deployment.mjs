/**
 * Vérification d'un déploiement.
 *
 * Usage :
 *   node scripts/verify-deployment.mjs https://api.exemple.mr https://admin.exemple.mr
 *
 * Reproduit la liste de contrôle de `docs/deployment.md` contre des URL réelles.
 * À lancer après chaque déploiement de production, et notamment avant de passer
 * à la phase suivante.
 */
const [backendUrl, dashboardUrl] = process.argv.slice(2);

if (!backendUrl) {
  console.error(
    'Usage : node scripts/verify-deployment.mjs <url-backend> [url-dashboard]\n' +
      'Exemple : node scripts/verify-deployment.mjs https://api.exemple.mr https://admin.exemple.mr',
  );
  process.exit(2);
}

const backend = backendUrl.replace(/\/$/, '');
const dashboard = dashboardUrl?.replace(/\/$/, '');

/**
 * Répétition locale : les exigences propres à la production (HTTPS,
 * `APP_ENV=production`) deviennent des avertissements plutôt que des échecs.
 * Le script reste ainsi utilisable pour valider le reste avant de déployer,
 * sans jamais laisser passer ces manques sur une vraie URL.
 */
const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)/.test(backend);

let passed = 0;
let failed = 0;
let warned = 0;

function check(label, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  OK    ${label}`);
  } else {
    failed += 1;
    console.log(`  ÉCHEC ${label}`);
    if (detail !== undefined) console.log(`        ${String(detail).slice(0, 200)}`);
  }
}

/** Exigence de production : simple avertissement lors d'une répétition locale. */
function expectInProduction(label, condition, detail) {
  if (condition) return check(label, true);
  if (isLocal) return warn(`${label} — ignoré en local`, detail);
  return check(label, false, detail);
}

function warn(label, detail) {
  warned += 1;
  console.log(`  ATTN  ${label}`);
  if (detail !== undefined) console.log(`        ${String(detail).slice(0, 200)}`);
}

async function run() {
  console.log(`\nBackend   : ${backend}`);
  console.log(`Dashboard : ${dashboard ?? '(non fourni)'}\n`);

  /* --- Disponibilité --------------------------------------------------------- */
  console.log('Disponibilité');

  const health = await safeFetch(`${backend}/api/health`);
  check('GET /api/health répond 200', health?.status === 200, health?.status);

  const deep = await safeFetch(`${backend}/api/health?deep=true`);
  const deepBody = await safeJson(deep);
  check(
    'MongoDB est connecté',
    deepBody?.data?.dependencies?.mongodb?.state === 'connected',
    JSON.stringify(deepBody?.data?.dependencies ?? deepBody),
  );
  expectInProduction(
    'L’environnement est déclaré en production',
    deepBody?.data?.environment === 'production',
    `APP_ENV = ${deepBody?.data?.environment} (attendu : production)`,
  );

  /* --- Transport et en-têtes -------------------------------------------------- */
  console.log('\nTransport et en-têtes');

  expectInProduction('L’API est servie en HTTPS', backend.startsWith('https://'), backend);

  const headers = health?.headers;
  check(
    'Strict-Transport-Security est présent',
    Boolean(headers?.get('strict-transport-security')),
    headers?.get('strict-transport-security'),
  );
  check('X-Content-Type-Options: nosniff', headers?.get('x-content-type-options') === 'nosniff');
  check('X-Frame-Options: DENY', headers?.get('x-frame-options') === 'DENY');
  check(
    'Content-Security-Policy verrouillée',
    (headers?.get('content-security-policy') ?? '').includes("default-src 'none'"),
    headers?.get('content-security-policy'),
  );

  /* --- CORS ------------------------------------------------------------------- */
  console.log('\nContrôle d’origine');

  if (dashboard) {
    const allowed = await safeFetch(`${backend}/api/health`, { headers: { Origin: dashboard } });
    check(
      'Le domaine du dashboard est autorisé',
      allowed?.headers.get('access-control-allow-origin') === dashboard,
      `reçu : ${allowed?.headers.get('access-control-allow-origin') ?? 'aucun en-tête'} — vérifiez CORS_ORIGINS`,
    );
  } else {
    warn('URL du dashboard non fournie : autorisation d’origine non vérifiée');
  }

  const foreign = await safeFetch(`${backend}/api/health`, {
    headers: { Origin: 'https://origine-non-autorisee.example' },
  });
  check(
    'Une origine tierce n’est pas autorisée',
    !foreign?.headers.get('access-control-allow-origin'),
    foreign?.headers.get('access-control-allow-origin'),
  );

  /* --- Autorisation ----------------------------------------------------------- */
  console.log('\nAutorisation');

  const write = await safeFetch(`${backend}/api/hotels`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  check('POST /api/hotels sans jeton → 401', write?.status === 401, write?.status);

  const users = await safeFetch(`${backend}/api/users`);
  check('GET /api/users sans jeton → 401', users?.status === 401, users?.status);

  const publicRead = await safeFetch(`${backend}/api/hotels`);
  const publicBody = await safeJson(publicRead);
  check('GET /api/hotels est public → 200', publicRead?.status === 200, publicRead?.status);

  const items = publicBody?.data?.items ?? [];
  check(
    'Aucun brouillon n’est exposé publiquement',
    items.every((item) => item.status === 'PUBLISHED'),
    items.map((item) => item.status).join(', '),
  );

  if (items.length === 0) {
    warn(
      'Aucun hôtel publié : la base de production est vide',
      'Créez du contenu depuis le dashboard, sinon l’application mobile n’affichera rien.',
    );
  }

  /* --- Dashboard --------------------------------------------------------------- */
  if (dashboard) {
    console.log('\nDashboard');

    expectInProduction(
      'Le dashboard est servi en HTTPS',
      dashboard.startsWith('https://'),
      dashboard,
    );

    const root = await safeFetch(dashboard, { redirect: 'manual' });
    check(
      'La racine redirige vers la connexion',
      root?.status === 307 && (root.headers.get('location') ?? '').includes('/login'),
      `${root?.status} → ${root?.headers.get('location')}`,
    );

    const login = await safeFetch(`${dashboard}/login`);
    const loginHtml = login ? await login.text() : '';
    check('La page de connexion s’affiche', login?.status === 200, login?.status);
    check(
      'La page de connexion n’expose aucune URL interne d’API',
      !loginHtml.includes(backend),
      'API_URL semble présente dans le HTML — vérifiez qu’elle n’est pas préfixée NEXT_PUBLIC_',
    );
  }

  /* --- Résultat ----------------------------------------------------------------- */
  console.log(
    `\n${passed} vérifications réussies, ${failed} échouées, ${warned} avertissement(s)\n`,
  );

  if (failed > 0) {
    console.log('Le déploiement n’est pas conforme. Corrigez avant de passer à la phase suivante.');
    process.exit(1);
  }
  console.log('Déploiement conforme.');
}

async function safeFetch(url, options) {
  try {
    return await fetch(url, options);
  } catch (error) {
    check(`Requête vers ${url}`, false, error instanceof Error ? error.message : error);
    return undefined;
  }
}

async function safeJson(response) {
  if (!response) return undefined;
  try {
    return await response.clone().json();
  } catch {
    return undefined;
  }
}

run().catch((error) => {
  console.error('La vérification a échoué :', error);
  process.exit(1);
});
