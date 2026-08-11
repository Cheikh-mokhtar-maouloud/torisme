/**
 * Tests du durcissement de l'authentification.
 *
 * Usage : backend démarré et base remplie, puis
 *   npm run test:auth --workspace backend
 *
 * Couvre la rotation des jetons de rafraîchissement, la détection de rejeu, le
 * verrouillage après échecs, la réinitialisation et le changement de mot de
 * passe — c'est-à-dire tout ce qui, mal fait, laisse une session vivante là où
 * elle devrait être morte.
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
    if (detail !== undefined) console.log(`        ${JSON.stringify(detail).slice(0, 250)}`);
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

async function run() {
  console.log(`\nCible : ${BASE_URL}\n`);

  /* --- Rafraîchissement de session ------------------------------------------ */
  console.log('Rafraîchissement de session');

  const email = `refresh-${Date.now()}@example.com`;
  const signup = await call('/api/auth/register', {
    method: 'POST',
    body: { fullName: 'Test Refresh', email, password: 'MotDePasse123' },
  });

  check('Inscription → 201', signup.status === 201, signup.body);
  check(
    'Un jeton de rafraîchissement est délivré',
    typeof signup.body.data?.refreshToken === 'string' && signup.body.data.refreshToken.length > 20,
  );

  const firstRefresh = signup.body.data?.refreshToken;

  const renewed = await call('/api/auth/refresh', {
    method: 'POST',
    body: { refreshToken: firstRefresh },
  });
  check('Le rafraîchissement délivre un nouveau jeton', renewed.status === 200, renewed.body);
  check(
    'Le jeton de rafraîchissement est remplacé (rotation)',
    renewed.body.data?.refreshToken !== firstRefresh,
  );

  const secondRefresh = renewed.body.data?.refreshToken;

  // Rejouer un jeton déjà consommé signale un vol : la victime et l'attaquant
  // détiennent la même valeur, on révoque donc tout.
  const replay = await call('/api/auth/refresh', {
    method: 'POST',
    body: { refreshToken: firstRefresh },
  });
  check('Rejouer un jeton consommé → 401', replay.status === 401, replay.status);

  const afterReplay = await call('/api/auth/refresh', {
    method: 'POST',
    body: { refreshToken: secondRefresh },
  });
  check(
    'La détection de rejeu révoque toutes les sessions du compte',
    afterReplay.status === 401,
    afterReplay.status,
  );

  const bogus = await call('/api/auth/refresh', {
    method: 'POST',
    body: { refreshToken: 'jeton-inexistant' },
  });
  check('Un jeton inconnu → 401', bogus.status === 401, bogus.status);

  /* --- Verrouillage après échecs -------------------------------------------- */
  console.log('\nVerrouillage après échecs');

  const lockEmail = `lock-${Date.now()}@example.com`;
  await call('/api/auth/register', {
    method: 'POST',
    body: { fullName: 'Test Lock', email: lockEmail, password: 'MotDePasse123' },
  });

  const attempts = [];
  for (let index = 0; index < 5; index += 1) {
    attempts.push(
      await call('/api/auth/login', {
        method: 'POST',
        body: { email: lockEmail, password: 'mauvais' },
      }),
    );
  }
  check(
    'Les cinq échecs renvoient 401',
    attempts.every((attempt) => attempt.status === 401),
    attempts.map((attempt) => attempt.status),
  );

  const lockedOut = await call('/api/auth/login', {
    method: 'POST',
    body: { email: lockEmail, password: 'MotDePasse123' },
  });
  check(
    'Le compte est verrouillé même avec le bon mot de passe',
    lockedOut.status === 401 && String(lockedOut.body.error?.message).includes('tentatives'),
    lockedOut.body.error?.message,
  );

  /* --- Réinitialisation ------------------------------------------------------ */
  console.log('\nRéinitialisation de mot de passe');

  const unknown = await call('/api/auth/forgot-password', {
    method: 'POST',
    body: { email: 'personne-ici@example.com' },
  });
  const known = await call('/api/auth/forgot-password', {
    method: 'POST',
    body: { email: 'touriste@example.com' },
  });

  check('Email inconnu → 200', unknown.status === 200, unknown.status);
  check(
    'Réponse identique dans les deux cas (pas d’énumération)',
    JSON.stringify(unknown.body) === JSON.stringify(known.body),
    { inconnu: unknown.body, connu: known.body },
  );
  check(
    'Le jeton n’apparaît jamais dans la réponse',
    !JSON.stringify(known.body).toLowerCase().includes('token'),
    known.body,
  );

  const badToken = await call('/api/auth/reset-password', {
    method: 'POST',
    body: { token: 'a'.repeat(32), password: 'NouveauMotDePasse1' },
  });
  check('Jeton de réinitialisation invalide → 422', badToken.status === 422, badToken.status);

  /* --- Changement de mot de passe -------------------------------------------- */
  console.log('\nChangement de mot de passe');

  const changeEmail = `change-${Date.now()}@example.com`;
  const account = await call('/api/auth/register', {
    method: 'POST',
    body: { fullName: 'Test Change', email: changeEmail, password: 'MotDePasse123' },
  });
  const accessToken = account.body.data?.token;
  const accountRefresh = account.body.data?.refreshToken;

  const wrongCurrent = await call('/api/auth/change-password', {
    method: 'POST',
    token: accessToken,
    body: { currentPassword: 'faux', newPassword: 'NouveauMotDePasse1' },
  });
  check('Mot de passe actuel erroné → 422', wrongCurrent.status === 422, wrongCurrent.status);

  const anonymousChange = await call('/api/auth/change-password', {
    method: 'POST',
    body: { currentPassword: 'MotDePasse123', newPassword: 'NouveauMotDePasse1' },
  });
  check('Changer sans jeton → 401', anonymousChange.status === 401, anonymousChange.status);

  const changed = await call('/api/auth/change-password', {
    method: 'POST',
    token: accessToken,
    body: { currentPassword: 'MotDePasse123', newPassword: 'NouveauMotDePasse1' },
  });
  check('Changement réussi → 200', changed.status === 200, changed.body);

  const staleRefresh = await call('/api/auth/refresh', {
    method: 'POST',
    body: { refreshToken: accountRefresh },
  });
  check(
    'Le changement révoque les sessions ouvertes ailleurs',
    staleRefresh.status === 401,
    staleRefresh.status,
  );

  const oldPassword = await call('/api/auth/login', {
    method: 'POST',
    body: { email: changeEmail, password: 'MotDePasse123' },
  });
  const newPassword = await call('/api/auth/login', {
    method: 'POST',
    body: { email: changeEmail, password: 'NouveauMotDePasse1' },
  });
  check('L’ancien mot de passe ne fonctionne plus → 401', oldPassword.status === 401);
  check('Le nouveau mot de passe fonctionne → 200', newPassword.status === 200, newPassword.body);

  /* --- Profil ----------------------------------------------------------------- */
  console.log('\nProfil');

  const profileToken = newPassword.body.data?.token;

  const updated = await call('/api/auth/profile', {
    method: 'PATCH',
    token: profileToken,
    body: { fullName: 'Nom Modifié', phone: '+22246123456' },
  });
  check(
    'Le profil est modifiable',
    updated.status === 200 && updated.body.data?.fullName === 'Nom Modifié',
    updated.body,
  );

  const emailAttempt = await call('/api/auth/profile', {
    method: 'PATCH',
    token: profileToken,
    body: { email: 'pirate@example.com' },
  });
  check(
    'L’email envoyé au profil est ignoré',
    emailAttempt.body.data?.email === changeEmail,
    emailAttempt.body.data?.email,
  );

  const roleAttempt = await call('/api/auth/profile', {
    method: 'PATCH',
    token: profileToken,
    body: { role: 'ADMIN' },
  });
  check(
    'Le rôle envoyé au profil est ignoré',
    roleAttempt.body.data?.role === 'USER',
    roleAttempt.body.data?.role,
  );

  /* --- Déconnexion ------------------------------------------------------------ */
  console.log('\nDéconnexion');

  const sessionRefresh = newPassword.body.data?.refreshToken;
  await call('/api/auth/logout', { method: 'POST', body: { refreshToken: sessionRefresh } });

  const afterLogout = await call('/api/auth/refresh', {
    method: 'POST',
    body: { refreshToken: sessionRefresh },
  });
  check(
    'La déconnexion révoque le jeton de rafraîchissement',
    afterLogout.status === 401,
    afterLogout.status,
  );

  console.log(`\n${passed} réussis, ${failed} échoués\n`);
  if (failed > 0) process.exit(1);
}

run().catch((error) => {
  console.error('Le test a échoué :', error);
  process.exit(1);
});
