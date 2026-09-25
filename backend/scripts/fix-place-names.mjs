/**
 * Correction des noms de lieux importés d'OpenStreetMap.
 *
 * Usage :
 *   node backend/scripts/fix-place-names.mjs [--dry-run] [--type hotels|restaurants|attractions]
 *
 * ─── Le problème ────────────────────────────────────────────────────────────
 *
 * L'import a repris l'étiquette `name` telle quelle. Or en Mauritanie, les
 * contributeurs y écrivent souvent les deux langues à la suite :
 *
 *     « Hôtel Sabah فندق الصباح »
 *     « Mauritalia موريطاليا »
 *
 * Affiché ainsi, le nom est illisible dans les deux langues : le lecteur
 * francophone butte sur l'arabe, l'arabophone sur le français, et la chaîne est
 * trop longue pour tenir sur une ligne de fiche.
 *
 * ─── Pourquoi ne pas simplement couper la chaîne ────────────────────────────
 *
 * On pourrait découper au changement d'écriture. C'est tentant et faux dans les
 * cas qui comptent : rien ne garantit l'ordre des deux langues, ni que la partie
 * latine soit le nom français plutôt qu'une translittération, ni qu'un nom
 * contenant un chiffre ou un sigle se coupe au bon endroit.
 *
 * OpenStreetMap répond déjà à la question : `name:fr`, `name:ar` et `name:en`
 * existent précisément pour cela. Ce script rejoue donc la requête d'import —
 * **une seule** pour tout le pays — et relit ces étiquettes à la source.
 *
 * ─── Comment les fiches sont retrouvées ─────────────────────────────────────
 *
 * L'import n'a pas conservé l'identifiant OpenStreetMap. La correspondance se
 * fait donc sur la position : un lieu de la base et un nœud d'OSM à moins de
 * trente mètres sont le même. C'est fiable ici parce que les coordonnées de la
 * base **viennent** d'OSM : elles sont identiques, à l'arrondi près.
 *
 * Le découpage par écriture ne sert que de dernier recours, pour les fiches
 * qu'aucun nœud ne rejoint.
 */

const API = process.env.SMOKE_BASE_URL ?? 'https://localhost';
const EMAIL = process.env.ADMIN_EMAIL ?? 'admin@tourism.mr';
const PASSWORD = process.env.ADMIN_PASSWORD ?? 'Admin123!';

const DRY_RUN = process.argv.includes('--dry-run');

const typeIndex = process.argv.indexOf('--type');
const ONLY_TYPE = typeIndex === -1 ? null : process.argv[typeIndex + 1];

if (API.includes('localhost')) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const USER_AGENT = 'tourism-platform-import/1.0 (correction ponctuelle de noms mauritaniens)';
const OVERPASS = 'https://overpass-api.de/api/interpreter';

/** Même requête que l'import : c'est la garantie de retrouver les mêmes nœuds. */
const QUERY = `[out:json][timeout:180];
area["ISO3166-1"="MR"][admin_level=2]->.mr;
(
  nwr["tourism"="hotel"](area.mr);
  nwr["tourism"="guest_house"](area.mr);
  nwr["amenity"="restaurant"](area.mr);
  nwr["amenity"="cafe"](area.mr);
  nwr["tourism"="attraction"](area.mr);
  nwr["tourism"="museum"](area.mr);
  nwr["historic"](area.mr);
);
out center tags;`;

const SAME_PLACE_METERS = 30;

const ARABIC = /[؀-ۿݐ-ݿ]/;
const LATIN = /[A-Za-zÀ-ÿ]/;

function metersBetween(a, b) {
  const latMeters = (a.latitude - b.latitude) * 111_320;
  const lngMeters = (a.longitude - b.longitude) * 111_320 * Math.cos((a.latitude * Math.PI) / 180);
  return Math.hypot(latMeters, lngMeters);
}

/**
 * Sépare une chaîne mêlant les deux écritures.
 *
 * Dernier recours, employé seulement quand aucun nœud OSM ne correspond. La
 * découpe se fait mot par mot : un mot est arabe s'il contient au moins un
 * caractère arabe. Les nombres et la ponctuation suivent le groupe précédent,
 * faute de quoi « Hôtel 5 نجوم » perdrait son chiffre.
 */
function splitByScript(name) {
  const words = name.split(/\s+/).filter(Boolean);
  const latin = [];
  const arabic = [];
  let current = null;

  for (const word of words) {
    if (ARABIC.test(word)) current = arabic;
    else if (LATIN.test(word)) current = latin;
    // Un mot sans lettre — un chiffre, un tiret — rejoint le groupe en cours.
    (current ?? latin).push(word);
  }

  return { latin: latin.join(' ').trim(), arabic: arabic.join(' ').trim() };
}

/**
 * Choisit le nom à afficher, et le nom arabe à conserver.
 *
 * L'ordre de préférence n'est pas indifférent : `name:fr` d'abord parce que
 * l'application s'adresse d'abord à un public francophone et que la fiche est
 * rédigée en français ; `name:en` ensuite ; puis la partie latine de `name`.
 *
 * Rien n'est inventé : si aucune de ces sources ne donne de nom latin, la fiche
 * garde son nom d'origine. Un nom arabe seul vaut mieux qu'un nom translittéré
 * à la main, qui serait faux pour l'établissement.
 */
function chooseNames(tags, currentName) {
  const fromTags = {
    fr: tags?.['name:fr']?.trim(),
    en: tags?.['name:en']?.trim(),
    ar: tags?.['name:ar']?.trim(),
    plain: tags?.name?.trim(),
  };

  const split = splitByScript(currentName);

  const display = fromTags.fr || fromTags.en || split.latin || fromTags.plain || currentName;
  const arabic = fromTags.ar || split.arabic || undefined;

  return { display, arabic };
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

  for (let page = 1; ; page += 1) {
    const { payload } = await call(token, `${path}?page=${page}&limit=100`, 'GET');
    items.push(...(payload?.data?.items ?? []));
    if (!payload?.data?.meta?.hasNextPage) break;
  }

  return items;
}

/**
 * Fichier de cache de la réponse Overpass.
 *
 * Overpass est un service public gratuit, servi par des bénévoles. Rejouer une
 * requête couvrant tout un pays à chaque exécution est un abus, et il se
 * défend : deux appels rapprochés ont suffi à obtenir un 504.
 *
 * La réponse est donc conservée. Les étiquettes d'OpenStreetMap ne changent pas
 * d'une minute à l'autre ; un essai à blanc suivi d'une exécution réelle n'a
 * aucune raison d'interroger le service deux fois.
 */
const CACHE_FILE = new URL('./.osm-cache.json', import.meta.url);
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function readCache() {
  const { readFile, stat } = await import('node:fs/promises');

  try {
    const info = await stat(CACHE_FILE);
    const age = Date.now() - info.mtimeMs;
    if (age > CACHE_MAX_AGE_MS) return null;

    const nodes = JSON.parse(await readFile(CACHE_FILE, 'utf8'));
    console.log(`Cache lu (${Math.round(age / 60_000)} min) : ${nodes.length} nœuds.`);
    return nodes;
  } catch {
    // Absence, corruption, droits : dans tous les cas on interroge le service.
    return null;
  }
}

async function writeCache(nodes) {
  const { writeFile } = await import('node:fs/promises');
  try {
    await writeFile(CACHE_FILE, JSON.stringify(nodes), 'utf8');
  } catch {
    // Un cache non écrit n'empêche rien : la prochaine exécution redemandera.
  }
}

async function fetchOsmNodes() {
  const cached = await readCache();
  if (cached) return cached;

  /*
   * Trois tentatives, avec attente croissante.
   *
   * 504 et 429 sont des refus **temporaires** : le serveur est saturé, pas en
   * panne. Abandonner au premier obtligerait à relancer le script à la main, ce
   * qui revient à faire la temporisation soi-même.
   *
   * Les attentes sont longues — une, puis deux, puis quatre minutes — parce
   * qu'une file d'attente Overpass ne se vide pas en dix secondes. Réessayer
   * trop vite aggrave la saturation qu'on subit.
   */
  const delays = [60_000, 120_000, 240_000];

  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    const response = await fetch(OVERPASS, {
      method: 'POST',
      // Sans `User-Agent`, Overpass refuse la requête par un 406 qui ne mentionne
      // jamais l'en-tête manquant — le code d'erreur est trompeur.
      headers: { 'Content-Type': 'text/plain', 'User-Agent': USER_AGENT },
      body: QUERY,
    });

    if (response.ok) {
      const payload = await response.json();

      const nodes = (payload.elements ?? [])
        .map((element) => {
          const latitude = element.lat ?? element.center?.lat;
          const longitude = element.lon ?? element.center?.lon;
          if (latitude === undefined || longitude === undefined) return null;
          return { latitude, longitude, tags: element.tags ?? {} };
        })
        .filter(Boolean);

      await writeCache(nodes);
      return nodes;
    }

    const isTemporary = response.status === 504 || response.status === 429 || response.status === 503;
    const delay = delays[attempt];

    if (!isTemporary || delay === undefined) {
      throw new Error(
        `Overpass a répondu ${response.status}.` +
          (isTemporary ? ' Le service reste saturé ; réessayez plus tard.' : ''),
      );
    }

    console.log(
      `Overpass a répondu ${response.status} (saturé). Nouvelle tentative dans ` +
        `${delay / 60_000} min…`,
    );
    await wait(delay);
  }

  throw new Error('Overpass reste indisponible.');
}

/**
 * Indexe les nœuds par carré de 500 m.
 *
 * Sans cet index, retrouver le nœud le plus proche de chaque fiche imposerait de
 * parcourir les milliers de nœuds pour chacune des 470 fiches — quelques
 * millions de comparaisons. La grille ramène la recherche aux seuls nœuds du
 * voisinage.
 */
function buildIndex(nodes) {
  const cells = new Map();
  const key = (lat, lng) => `${Math.round(lat * 200)}:${Math.round(lng * 200)}`;

  for (const node of nodes) {
    const cellKey = key(node.latitude, node.longitude);
    const bucket = cells.get(cellKey);
    if (bucket) bucket.push(node);
    else cells.set(cellKey, [node]);
  }

  return {
    nearest(latitude, longitude) {
      let best = null;
      let bestDistance = Infinity;

      // Les huit cases voisines en plus de la sienne : un lieu proche d'un bord
      // se trouve sinon dans la case d'à côté et resterait introuvable.
      for (let dLat = -1; dLat <= 1; dLat += 1) {
        for (let dLng = -1; dLng <= 1; dLng += 1) {
          const bucket = cells.get(
            `${Math.round(latitude * 200) + dLat}:${Math.round(longitude * 200) + dLng}`,
          );
          if (!bucket) continue;

          for (const node of bucket) {
            const distance = metersBetween({ latitude, longitude }, node);
            if (distance < bestDistance) {
              bestDistance = distance;
              best = node;
            }
          }
        }
      }

      return bestDistance <= SAME_PLACE_METERS ? best : null;
    },
  };
}

async function run() {
  console.log(`\nCible : ${API}`);
  console.log(DRY_RUN ? 'Mode : essai à blanc\n' : 'Mode : correction\n');

  const token = await login();

  console.log('Interrogation d’OpenStreetMap…');
  const nodes = await fetchOsmNodes();
  console.log(`${nodes.length} nœuds reçus.\n`);

  const index = buildIndex(nodes);

  const resources = [
    ['hotels', 'Hôtels', '/api/hotels'],
    ['restaurants', 'Restaurants', '/api/restaurants'],
    ['attractions', 'Sites', '/api/attractions'],
  ].filter(([key]) => ONLY_TYPE === null || ONLY_TYPE === key);

  const counts = { renamed: 0, unchanged: 0, fromOsm: 0, fromSplit: 0, failed: 0 };

  for (const [, label, path] of resources) {
    const items = await listAll(token, path);
    let touched = 0;

    for (const item of items) {
      const [longitude, latitude] = item.location?.coordinates ?? [];
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        counts.unchanged += 1;
        continue;
      }

      const node = index.nearest(latitude, longitude);
      const { display, arabic } = chooseNames(node?.tags, item.name);

      if (display === item.name) {
        counts.unchanged += 1;
        continue;
      }

      if (node?.tags?.['name:fr'] || node?.tags?.['name:en']) counts.fromOsm += 1;
      else counts.fromSplit += 1;

      /*
       * Le nom arabe est ajouté à la description, faute d'un champ dédié.
       *
       * C'est un compromis assumé : lui donner sa place demanderait un champ
       * dans le schéma, le modèle, les types partagés et les deux interfaces.
       * Le mettre en fin de description le conserve — il sert à retrouver
       * l'établissement dans une recherche en arabe — sans changer la forme des
       * données. Un champ dédié reste la bonne solution le jour où l'interface
       * arabe devra afficher le nom arabe en titre.
       */
      const arabicNote = arabic && !item.description.includes(arabic) ? `\n\n${arabic}` : '';

      if (DRY_RUN) {
        console.log(`  ${item.name}\n     -> ${display}${arabic ? `   [ar : ${arabic}]` : ''}`);
        counts.renamed += 1;
        touched += 1;
        continue;
      }

      const { status } = await call(token, `${path}/${item.id}`, 'PUT', {
        name: display,
        ...(arabicNote ? { description: item.description + arabicNote } : {}),
      });

      if (status === 200) {
        counts.renamed += 1;
        touched += 1;
      } else {
        console.log(`  échec  ${item.name}  HTTP ${status}`);
        counts.failed += 1;
      }
    }

    console.log(`${label.padEnd(13)} ${touched} renommé(s) sur ${items.length}`);
  }

  console.log('\nRésultat');
  console.log(`  Renommés            : ${counts.renamed}`);
  console.log(`  Inchangés           : ${counts.unchanged}`);
  console.log(`  Échecs              : ${counts.failed}`);
  console.log(`  dont nom OSM localisé : ${counts.fromOsm}`);
  console.log(`  dont découpage        : ${counts.fromSplit}`);

  console.log(
    '\nLes noms viennent des étiquettes name:fr et name:en d’OpenStreetMap.\n' +
      'Rien n’a été traduit ni translittéré : une fiche sans nom latin dans la\n' +
      'source garde son nom d’origine.\n',
  );
}

run().catch((error) => {
  console.error('\nÉchec :', error.message);
  process.exit(1);
});
