/**
 * Normalisation des noms de ville.
 *
 * Usage :
 *   node backend/scripts/fix-city-names.mjs [--dry-run]
 *
 * ─── Le problème ────────────────────────────────────────────────────────────
 *
 * Les villes viennent du géocodage inverse de Nominatim, qui rend le nom local.
 * En Mauritanie il mêle souvent les deux écritures — « Nouakchott نواكشوط » —
 * ou ne donne que l'arabe.
 *
 * Ce n'est pas qu'une question d'affichage. « Nouakchott », « Nouakchott
 * نواكشوط » et « نواكشوط » sont trois chaînes distinctes : le filtre par ville
 * les traite comme trois villes, et chercher la capitale n'en ramène qu'un
 * tiers des établissements.
 *
 * ─── La règle ───────────────────────────────────────────────────────────────
 *
 * Pour un nom mêlant les deux écritures, on garde la partie latine : elle est
 * déjà dans la donnée, rien n'est inventé.
 *
 * Pour les quelques villes écrites en arabe seul, une table explicite. Ce ne
 * sont pas des translittérations devinées : Nouakchott, Nouadhibou, Akjoujt et
 * Kansado sont les noms français officiels de ces villes, ceux de
 * l'administration mauritanienne et des panneaux routiers. Toute ville absente
 * de cette table garde son nom arabe — mieux vaut un nom exact dans une seule
 * langue qu'une approximation dans deux.
 */

const API = process.env.SMOKE_BASE_URL ?? 'https://localhost';
const EMAIL = process.env.ADMIN_EMAIL ?? 'admin@tourism.mr';
const PASSWORD = process.env.ADMIN_PASSWORD ?? 'Admin123!';

const DRY_RUN = process.argv.includes('--dry-run');

if (API.includes('localhost')) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const ARABIC = /[؀-ۿݐ-ݿ]/;
const LATIN = /[A-Za-zÀ-ÿ]/;

/** Noms français officiels des villes qu'OSM ne nomme qu'en arabe. */
const OFFICIAL_NAMES = {
  'نواكشوط': 'Nouakchott',
  'نواذيبو': 'Nouadhibou',
  'أكجوجت': 'Akjoujt',
  'كانصادو': 'Kansado',
};

function latinPart(value) {
  const words = value.split(/\s+/).filter(Boolean);
  const kept = [];

  for (const word of words) {
    // Un mot contenant de l'arabe est écarté ; les autres sont conservés dans
    // leur ordre, ce qui préserve « Chelkha Ras El-imane ».
    if (!ARABIC.test(word)) kept.push(word);
  }

  return kept.join(' ').trim();
}

function normalise(city) {
  if (!city) return null;

  const hasArabic = ARABIC.test(city);
  if (!hasArabic) return null;

  if (LATIN.test(city)) {
    const latin = latinPart(city);
    return latin.length >= 2 ? latin : null;
  }

  return OFFICIAL_NAMES[city.trim()] ?? null;
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
    await new Promise((r) => setTimeout(r, 20_000));
    return call(token, path, method, body);
  }

  const payload = await response.json().catch(() => ({}));
  return { status: response.status, payload };
}

async function listAll(token, path) {
  const items = [];
  for (let page = 1; ; page += 1) {
    const { payload } = await call(token, `${path}?page=${page}&limit=100`, 'GET');
    items.push(...(payload?.data?.items ?? []));
    if (!payload?.data?.meta?.hasNextPage) break;
  }
  return items;
}

async function run() {
  console.log(`\nCible : ${API}`);
  console.log(DRY_RUN ? 'Mode : essai à blanc\n' : 'Mode : correction\n');

  const token = await login();
  const counts = { fixed: 0, unchanged: 0, kept: 0, failed: 0 };
  const changes = new Map();

  for (const [label, path] of [
    ['Hôtels', '/api/hotels'],
    ['Restaurants', '/api/restaurants'],
    ['Sites', '/api/attractions'],
  ]) {
    const items = await listAll(token, path);
    let touched = 0;

    for (const item of items) {
      const city = item.address?.city;
      const next = normalise(city);

      if (!next || next === city) {
        // Distingue « rien à faire » de « arabe conservé faute de nom officiel ».
        if (city && ARABIC.test(city)) counts.kept += 1;
        else counts.unchanged += 1;
        continue;
      }

      changes.set(city, next);

      if (DRY_RUN) {
        counts.fixed += 1;
        touched += 1;
        continue;
      }

      /*
       * L'adresse est renvoyée entière : le schéma de mise à jour la valide
       * comme un tout, et n'envoyer que `city` ferait perdre la rue et le pays.
       */
      const { status } = await call(token, `${path}/${item.id}`, 'PUT', {
        address: { ...item.address, city: next },
      });

      if (status === 200) {
        counts.fixed += 1;
        touched += 1;
      } else {
        console.log(`  échec  ${item.name}  HTTP ${status}`);
        counts.failed += 1;
      }
    }

    console.log(`${label.padEnd(13)} ${touched} corrigée(s) sur ${items.length}`);
  }

  console.log('\nVilles normalisées');
  [...changes.entries()].sort().forEach(([from, to]) => console.log(`  ${from}  ->  ${to}`));

  console.log('\nRésultat');
  console.log(`  Fiches corrigées      : ${counts.fixed}`);
  console.log(`  Déjà correctes        : ${counts.unchanged}`);
  console.log(`  Arabe conservé        : ${counts.kept}`);
  console.log(`  Échecs                : ${counts.failed}`);
}

run().catch((error) => {
  console.error('\nÉchec :', error.message);
  process.exit(1);
});
