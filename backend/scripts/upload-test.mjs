/**
 * Tests du parcours de téléversement.
 *
 * Usage : backend démarré et base remplie, puis
 *   npm run test:uploads --workspace backend
 *
 * Couvre ce qu'un test de contrat HTTP ne peut pas vérifier autrement :
 * l'inspection des octets réels, la traversée de répertoire, le service du
 * fichier, l'idempotence de la suppression et le rattachement à une fiche.
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
    if (detail !== undefined) console.log(`        ${String(detail).slice(0, 250)}`);
  }
}

/* --- Fichiers de test, construits en mémoire ------------------------------- */

/** PNG 2×2 valide. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC',
  'base64',
);

/** JPEG minimal : en-tête SOI, segment SOF0 déclarant 16×32, puis EOI. */
const JPEG = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
  0x00, 0x01, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x20, 0x00, 0x10, 0x03, 0x01, 0x22,
  0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01, 0xff, 0xd9,
]);

/** Texte brut : doit être refusé malgré une extension et un type déclarés valides. */
const FAKE = Buffer.from('Ce fichier n est pas une image, seulement du texte.');

let token = '';

async function login() {
  const response = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@tourism.mr', password: 'Admin123!' }),
  });
  const payload = await response.json();
  return payload?.data?.token ?? '';
}

async function upload(
  buffer,
  { name = 'photo.jpg', type = 'image/jpeg', folder = 'hotels', auth = true } = {},
) {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type }), name);
  form.append('folder', folder);

  const response = await fetch(`${BASE_URL}/api/uploads`, {
    method: 'POST',
    headers: auth && token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });

  const text = await response.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text.slice(0, 120) };
  }
  return { status: response.status, body };
}

async function run() {
  console.log(`\nCible : ${BASE_URL}\n`);

  token = await login();

  /* --- Autorisation --------------------------------------------------------- */
  console.log('Autorisation');

  const anonymous = await upload(PNG, { auth: false });
  check('Téléverser sans jeton → 401', anonymous.status === 401, anonymous.status);

  const userLogin = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'touriste@example.com', password: 'Touriste123!' }),
  });
  const userToken = (await userLogin.json())?.data?.token;

  const asUser = await fetch(`${BASE_URL}/api/uploads`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${userToken}` },
    body: (() => {
      const form = new FormData();
      form.append('file', new Blob([PNG], { type: 'image/png' }), 'a.png');
      return form;
    })(),
  });
  check('Téléverser avec un rôle USER → 403', asUser.status === 403, asUser.status);

  /* --- Validation du contenu ------------------------------------------------ */
  console.log('\nValidation du contenu');

  const disguised = await upload(FAKE, { name: 'photo.jpg', type: 'image/jpeg' });
  check(
    'Un texte annoncé « image/jpeg » est refusé → 422',
    disguised.status === 422,
    JSON.stringify(disguised.body),
  );

  const empty = await upload(Buffer.alloc(0), { name: 'vide.png', type: 'image/png' });
  check('Un fichier vide est refusé → 422', empty.status === 422, empty.status);

  const oversized = await upload(Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]), {
    name: 'gros.png',
    type: 'image/png',
  });
  check(
    'Une image au-delà de la limite est refusée → 422',
    oversized.status === 422,
    oversized.status,
  );

  const badFolder = await upload(PNG, { name: 'a.png', type: 'image/png', folder: '../../etc' });
  check('Un dossier hors liste blanche → 422', badFolder.status === 422, badFolder.status);

  /* --- Téléversement et lecture des dimensions ------------------------------ */
  console.log('\nTéléversement');

  const png = await upload(PNG, { name: 'photo.png', type: 'image/png' });
  check('PNG accepté → 201', png.status === 201, JSON.stringify(png.body));
  check(
    'Les dimensions sont lues dans les octets',
    png.body.data?.width === 2 && png.body.data?.height === 2,
    JSON.stringify(png.body.data),
  );
  check(
    'Le nom de fichier client n’est pas réutilisé',
    !String(png.body.data?.providerId ?? '').includes('photo.png'),
    png.body.data?.providerId,
  );

  // Un JPEG annoncé « image/png » doit tout de même être détecté comme JPEG.
  const jpeg = await upload(JPEG, { name: 'trompeur.png', type: 'image/png' });
  check('JPEG accepté malgré un type déclaré erroné → 201', jpeg.status === 201, jpeg.status);
  check(
    'Le type réel prime sur le type déclaré (extension .jpg)',
    String(jpeg.body.data?.providerId ?? '').endsWith('.jpg'),
    jpeg.body.data?.providerId,
  );
  check(
    'Les dimensions JPEG sont lues dans le segment SOF',
    jpeg.body.data?.width === 16 && jpeg.body.data?.height === 32,
    JSON.stringify(jpeg.body.data),
  );

  /* --- Service du fichier ---------------------------------------------------- */
  console.log('\nService du fichier');

  const url = png.body.data?.url;
  const served = await fetch(url);
  check('L’image téléversée est servie → 200', served.status === 200, served.status);
  check(
    'Le type de contenu est correct',
    served.headers.get('content-type') === 'image/png',
    served.headers.get('content-type'),
  );
  check(
    'Le cache est immuable (le nom contient un identifiant aléatoire)',
    (served.headers.get('cache-control') ?? '').includes('immutable'),
    served.headers.get('cache-control'),
  );
  check('nosniff est présent', served.headers.get('x-content-type-options') === 'nosniff');

  const traversal = await fetch(`${BASE_URL}/api/files/hotels/../../../package.json`);
  check('Traversée de répertoire refusée → 404', traversal.status === 404, traversal.status);

  const encodedTraversal = await fetch(`${BASE_URL}/api/files/hotels/..%2f..%2fpackage.json`);
  check(
    'Traversée encodée refusée → 404',
    encodedTraversal.status === 404,
    encodedTraversal.status,
  );

  /* --- Rattachement à une fiche ---------------------------------------------- */
  console.log('\nRattachement à une fiche');

  const hotels = await fetch(`${BASE_URL}/api/hotels?limit=1`).then((response) => response.json());
  const hotel = hotels?.data?.items?.[0];

  if (hotel) {
    const gallery = [
      { ...png.body.data, order: 0 },
      { ...jpeg.body.data, order: 1 },
    ];

    const updated = await fetch(`${BASE_URL}/api/hotels/${hotel.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ images: gallery }),
    }).then((response) => response.json());

    check(
      'La galerie est enregistrée sur la fiche',
      updated.data?.images?.length === 2,
      JSON.stringify(updated.data?.images?.length),
    );
    check(
      'L’ordre est conservé — la position 0 fait la couverture',
      updated.data?.images?.[0]?.providerId === png.body.data?.providerId,
      updated.data?.images?.[0]?.providerId,
    );

    // Le marqueur de carte reprend bien la première image comme vignette.
    const map = await fetch(`${BASE_URL}/api/map?types=HOTEL`).then((response) => response.json());
    const marker = (map?.data?.markers ?? []).find((item) => item.id === hotel.id);
    check(
      'La carte reprend la couverture comme vignette',
      marker?.imageUrl === png.body.data?.url,
      `marqueur=${JSON.stringify(marker)} attendu=${png.body.data?.url} ids=${JSON.stringify((map?.data?.markers ?? []).map((m) => m.id))} hotel=${hotel.id}`,
    );

    // Restaure la fiche dans son état initial.
    await fetch(`${BASE_URL}/api/hotels/${hotel.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ images: hotel.images ?? [] }),
    });
  }

  /* --- Suppression ----------------------------------------------------------- */
  console.log('\nSuppression');

  const removal = await fetch(`${BASE_URL}/api/uploads/${png.body.data?.providerId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  check('Suppression → 200', removal.status === 200, removal.status);

  const afterRemoval = await fetch(url);
  check('Le fichier n’est plus servi → 404', afterRemoval.status === 404, afterRemoval.status);

  const secondRemoval = await fetch(`${BASE_URL}/api/uploads/${png.body.data?.providerId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  check(
    'Supprimer deux fois reste sans erreur',
    secondRemoval.status === 200,
    secondRemoval.status,
  );

  const anonymousRemoval = await fetch(`${BASE_URL}/api/uploads/${jpeg.body.data?.providerId}`, {
    method: 'DELETE',
  });
  check('Supprimer sans jeton → 401', anonymousRemoval.status === 401, anonymousRemoval.status);

  // Nettoyage du second fichier.
  await fetch(`${BASE_URL}/api/uploads/${jpeg.body.data?.providerId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });

  console.log(`\n${passed} réussis, ${failed} échoués\n`);
  if (failed > 0) process.exit(1);
}

run().catch((error) => {
  console.error('Le test de téléversement a échoué :', error);
  process.exit(1);
});
