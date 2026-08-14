/**
 * Images d'illustration pour les fiches importées.
 *
 * Usage :
 *   node backend/scripts/add-placeholder-images.mjs [--dry-run]
 *
 * ─── À lire avant de lancer ─────────────────────────────────────────────────
 *
 * Ces images **ne montrent pas** l'établissement concerné. Aucune banque
 * d'images libres ne couvre des hôtels et restaurants privés : OpenStreetMap
 * n'héberge pas de photographies, Wikimedia n'en a que pour les lieux notables,
 * et celles de Booking ou TripAdvisor appartiennent aux établissements.
 *
 * Ce sont donc des vues génériques, servies par un générateur d'images de
 * remplissage, choisies de façon déterministe à partir de l'identifiant du lieu
 * — la même fiche gardera toujours la même image, ce qui évite qu'un
 * rafraîchissement fasse changer l'apparence du site.
 *
 * Chaque image le déclare dans son texte alternatif : « Illustration — photo
 * non contractuelle ». Ce texte est lu par les lecteurs d'écran et sert de
 * légende de repli lorsque l'image ne se charge pas.
 *
 * ─── Ce que cela reste malgré tout ──────────────────────────────────────────
 *
 * Une belle photographie de désert sur la fiche d'un hôtel réel laisse croire
 * qu'elle montre cet hôtel. Pour une démonstration, c'est admis et cela rend
 * l'application présentable. Pour une ouverture au public, ce ne l'est pas : il
 * faut alors les photographies des établissements, obtenues auprès d'eux — ce
 * qui est d'ailleurs le premier contact commercial d'une plateforme
 * touristique.
 *
 * Le script est réversible : `--remove` retire toutes les illustrations qu'il a
 * posées, sans toucher aux vraies photographies.
 */

const API = process.env.SMOKE_BASE_URL ?? 'https://localhost';
const EMAIL = process.env.ADMIN_EMAIL ?? 'admin@tourism.mr';
const PASSWORD = process.env.ADMIN_PASSWORD ?? 'Admin123!';

const DRY_RUN = process.argv.includes('--dry-run');
const REMOVE = process.argv.includes('--remove');

if (API.includes('localhost')) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

/**
 * Marqueur reconnaissable dans l'URL.
 *
 * Il permet de distinguer une illustration d'une vraie photographie, donc de
 * retirer les premières sans risquer d'effacer les secondes. Sans lui, la seule
 * façon de faire le tri serait de rouvrir chaque fiche à la main.
 */
const MARKER = 'illustration';

const ALT = 'Illustration — photo non contractuelle';

/** Trois vues par fiche, pour que la galerie ne paraisse pas vide. */
function imagesFor(id) {
  return [0, 1, 2].map((index) => ({
    url: `https://picsum.photos/seed/${MARKER}-${id}-${index}/1200/800`,
    alt: ALT,
    order: index,
  }));
}

async function login() {
  const response = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });

  const payload = await response.json();
  if (!payload?.data?.token) throw new Error('Connexion administrateur impossible.');
  return payload.data.token;
}

async function call(token, path, method, body) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  if (response.status === 429) {
    await new Promise((resolve) => setTimeout(resolve, 20_000));
    return call(token, path, method, body);
  }

  const payload = await response.json().catch(() => ({}));
  return { status: response.status, payload };
}

async function listAll(token, path) {
  const items = [];
  let page = 1;

  for (;;) {
    const { payload } = await call(token, `${path}?page=${page}&limit=100`, 'GET');
    items.push(...(payload?.data?.items ?? []));
    if (!payload?.data?.meta?.hasNextPage) break;
    page += 1;
  }

  return items;
}

async function run() {
  console.log(`\nCible : ${API}`);
  console.log(REMOVE ? 'Mode : retrait des illustrations\n' : 'Mode : ajout d’illustrations\n');

  const token = await login();
  const counts = { updated: 0, skipped: 0, failed: 0 };

  for (const [label, path] of [
    ['Hôtels', '/api/hotels'],
    ['Restaurants', '/api/restaurants'],
    ['Sites', '/api/attractions'],
  ]) {
    const all = await listAll(token, path);
    let touched = 0;

    for (const item of all) {
      const images = item.images ?? [];
      const hasIllustration = images.some((image) => image.url?.includes(MARKER));

      let next;

      if (REMOVE) {
        if (!hasIllustration) {
          counts.skipped += 1;
          continue;
        }
        next = images.filter((image) => !image.url?.includes(MARKER));
      } else {
        /*
         * Une fiche qui possède déjà une image est laissée telle quelle. Les
         * cinq photographies venues de Wikimedia sont de vraies vues des lieux :
         * les recouvrir d'une illustration générique serait une régression.
         */
        if (images.length > 0) {
          counts.skipped += 1;
          continue;
        }
        next = imagesFor(item.id);
      }

      if (DRY_RUN) {
        counts.updated += 1;
        touched += 1;
        continue;
      }

      const { status } = await call(token, `${path}/${item.id}`, 'PUT', { images: next });

      if (status === 200) {
        counts.updated += 1;
        touched += 1;
      } else {
        counts.failed += 1;
      }
    }

    console.log(`${label.padEnd(13)} ${touched} fiche(s) modifiée(s) sur ${all.length}`);
  }

  console.log('\nRésultat');
  console.log(`  Fiches modifiées : ${counts.updated}`);
  console.log(`  Inchangées       : ${counts.skipped}`);
  console.log(`  Échecs           : ${counts.failed}`);

  if (!REMOVE) {
    console.log(
      '\nCes images ne montrent pas les établissements. Elles rendent la\n' +
        'démonstration présentable ; avant toute ouverture au public, il faut les\n' +
        'remplacer par les photographies obtenues auprès des établissements.\n' +
        '\nPour les retirer : node backend/scripts/add-placeholder-images.mjs --remove\n',
    );
  }
}

run().catch((error) => {
  console.error('\nÉchec :', error.message);
  process.exit(1);
});
