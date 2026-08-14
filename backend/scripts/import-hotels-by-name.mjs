/**
 * Ajout d'hôtels désignés par leur nom.
 *
 * Usage :
 *   node backend/scripts/import-hotels-by-name.mjs [--dry-run]
 *
 * ─── Pourquoi ce script existe à côté de import-osm.mjs ─────────────────────
 *
 * `import-osm.mjs` ratisse une zone : il prend ce qu'OpenStreetMap y a
 * cartographié. Certains établissements bien connus n'y figurent pourtant pas,
 * ou sous une forme que la requête ne retient pas. Ce script part de l'inverse :
 * une liste de noms, et pour chacun une recherche nominative.
 *
 * ─── D'où viennent les coordonnées ──────────────────────────────────────────
 *
 * De **Nominatim**, le moteur de recherche d'OpenStreetMap. Ce n'est pas un
 * détail juridique : les données restent sous ODbL, réutilisables avec
 * attribution, là où les coordonnées d'un annuaire commercial ne le seraient
 * pas.
 *
 * La contrepartie est la couverture : Nominatim ne trouve que ce qu'OSM
 * contient. Un hôtel absent de la carte reste introuvable, et le script le dit
 * plutôt que d'inventer une position. Une fiche mal placée est pire qu'une
 * fiche absente — le voyageur s'y rend.
 *
 * ─── Conditions d'usage de Nominatim ────────────────────────────────────────
 *
 * Une requête par seconde au maximum, et un en-tête `User-Agent` identifiant
 * l'application. Sans lui, le service répond par un refus : c'est un filtre
 * anti-robot, et son code d'erreur ne mentionne jamais l'en-tête manquant.
 */

const API = process.env.SMOKE_BASE_URL ?? 'https://localhost';
const EMAIL = process.env.ADMIN_EMAIL ?? 'admin@tourism.mr';
const PASSWORD = process.env.ADMIN_PASSWORD ?? 'Admin123!';

const DRY_RUN = process.argv.includes('--dry-run');

if (API.includes('localhost')) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const USER_AGENT = 'tourism-platform-import/1.0 (import ponctuel de lieux mauritaniens)';
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';

/** Les noms à ajouter, tels qu'ils ont été fournis. */
const NAMES = [
  'AZALAÏ HOTEL NOUAKCHOTT',
  'Fasq Hotel Nouakchott',
  'Sheraton Nouakchott Hotel',
  'MH Hotel Nouakchott',
  'Urban Hotel Suites',
  'HOTEL HIBA',
  'The Best Centric Hotel',
  'Nouakchott Hotel',
  'Hotel Aloe Emira NKC',
  'Al Khaima City Center',
  'Mauricenter Hotel',
  'Monotel (Dar El Barka)',
  'Hôtel Sunset',
  'Semiramis Hotel Centre Ville',
  'AB Business Hôtel',
  'Grand Plaza Nouakchott',
  'Hôtel Mandela Nouakchott',
  'Sabah Resort',
  'Premium Suites Marrakech',
  'فندق انواكشوط',
  'Auberge Triskell Nouakchott',
  'TRANSIT HOSTEL NOUAKCHOTT',
  'Résidence Quatre Saison',
  'Hôtel le Berger',
  'Hôtel Hayatt',
  'Hotel Iman',
  'Hotel Wissal',
  'Hotel Tfeila',
  'Hotel Halima',
  'Hotel Atlantic',
  'Hotel Ksar',
  'Hotel El Amane',
  'Hotel Mouna',
  'Hotel Adrar',
  'Hotel Emira',
  'Hotel El Medina',
  'Hotel Al Salam',
  'Hotel El Khater',
  'Hotel Sahara',
  'Hotel Oasis',
];

/**
 * Réduit un nom à ses mots distinctifs, pour reconnaître un doublon.
 *
 * Les accents, la casse et les mots de catégorie — « hôtel », « auberge »,
 * « résidence », « Nouakchott » — ne distinguent rien : presque toutes les
 * fiches les portent. Sans ce filtrage, « Hotel Sahara » et « Hotel Adrar » se
 * ressembleraient par leur seul mot commun.
 */
const GENERIC = ['hotel', 'auberge', 'residence', 'resort', 'nouakchott', 'nkc', 'the'];

function keyOf(name) {
  return (name ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9؀-ۿ ]/g, ' ')
    .split(/\s+/)
    .filter((word) => word && !GENERIC.includes(word))
    .join(' ')
    .trim();
}

/**
 * Vrai si les deux noms désignent vraisemblablement le même établissement.
 *
 * Une clé vide — un nom entièrement fait de mots génériques, comme « Nouakchott
 * Hotel » — ne peut rien rapprocher : la traiter comme une inclusion la ferait
 * correspondre à **toutes** les fiches. C'est exactement la confusion qui a
 * rapproché « Nouakchott Hotel » de « Auberge du Banc d'Arguin ».
 */
function sameName(a, b) {
  const [x, y] = [keyOf(a), keyOf(b)];
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

/**
 * Distance approximative en mètres.
 *
 * Une projection plate suffit ici : sur quelques centaines de mètres à la
 * latitude de Nouakchott, l'écart avec la formule sphérique est inférieur au
 * mètre, très en deçà du seuil que l'on compare.
 */
function metersBetween(a, b) {
  const latMeters = (a.latitude - b.latitude) * 111_320;
  const lngMeters = (a.longitude - b.longitude) * 111_320 * Math.cos((a.latitude * Math.PI) / 180);
  return Math.hypot(latMeters, lngMeters);
}

/**
 * Les orthographes de la capitale rencontrées dans les données.
 *
 * OpenStreetMap la nomme tantôt « Nouakchott », tantôt par son arrondissement —
 * Tevragh Zeina, Ksar, Sebkha, Dar Naim… — et parfois en arabe. Un test
 * d'égalité stricte écarterait la moitié des fiches de la ville.
 */
const NOUAKCHOTT = [
  'nouakchott',
  'tevragh',
  'ksar',
  'sebkha',
  'dar naim',
  'toujounine',
  'arafat',
  'riyad',
  'teyarett',
  'elmina',
  'el mina',
  'نواكشوط',
];

function isNouakchott(city) {
  const normalised = (city ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return NOUAKCHOTT.some((name) => normalised.includes(name));
}

function coordsOf(hotel) {
  const [longitude, latitude] = hotel?.location?.coordinates ?? [];
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
}

/**
 * Deux fiches à moins de cinquante mètres sont le même établissement.
 *
 * Ce contrôle rattrape ce que le nom ne peut pas voir : « Nouakchott Hotel » et
 * « فندق انواكشوط » sont le même hôtel écrit dans deux langues, et Nominatim
 * rend pour les deux le même point. Sans cette vérification, la carte
 * porterait deux marqueurs superposés qu'aucun geste ne permettrait de séparer.
 *
 * Cinquante mètres : assez large pour absorber l'imprécision d'un point posé
 * tantôt sur l'entrée, tantôt sur le bâtiment ; assez étroit pour ne pas
 * confondre deux hôtels d'une même avenue.
 */
const SAME_PLACE_METERS = 50;

/**
 * Centre de Nouakchott, et rayon au-delà duquel un résultat est rejeté.
 *
 * Tous les noms de cette liste ont été donnés comme des hôtels de Nouakchott.
 * Or les variantes de recherche les plus larges — « <nom>, Mauritanie » —
 * ramènent volontiers un homonyme à l'autre bout du pays : « Hotel Al Salam »
 * est ainsi revenu à cent trente kilomètres au sud, sur le fleuve Sénégal.
 *
 * Trente kilomètres englobent l'agglomération et son aéroport, sans laisser
 * passer une autre ville.
 */
const NOUAKCHOTT_CENTER = { latitude: 18.0858, longitude: -15.9785 };
const NOUAKCHOTT_RADIUS_METERS = 30_000;

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

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Une recherche Nominatim. Rend `null` si rien ne sort. */
async function search(q) {
  const query = new URLSearchParams({
    q,
    format: 'jsonv2',
    limit: '1',
    countrycodes: 'mr',
    addressdetails: '1',
  });

  const response = await fetch(`${NOMINATIM}?${query}`, {
    headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'fr' },
  });

  if (!response.ok) return null;

  const hit = (await response.json())?.[0];
  if (!hit) return null;

  /*
   * Seul un hébergement est accepté.
   *
   * Accepter tout commerce ou tout bâtiment paraissait prudent ; ce ne l'était
   * pas. Les recherches élargies ont ainsi rendu « Pressing el Medina » pour
   * « Hotel El Medina » et « École Oasis Books » pour « Hotel Oasis » — deux
   * commerces qui partagent un mot avec l'hôtel cherché, rien de plus.
   *
   * Le refus reste la position par défaut : ce qui n'est pas manifestement un
   * lieu où l'on dort n'entre pas.
   */
  const LODGING = ['hotel', 'hostel', 'guest_house', 'motel', 'apartment', 'chalet', 'resort'];
  if (hit.category !== 'tourism' || !LODGING.includes(hit.type)) return null;

  return {
    name: hit.name,
    latitude: Number(hit.lat),
    longitude: Number(hit.lon),
    city: hit.address?.city ?? hit.address?.town ?? hit.address?.state ?? 'Nouakchott',
    street: hit.address?.road ?? hit.address?.suburb ?? 'Adresse non précisée',
    displayName: hit.display_name,
  };
}

/**
 * Cherche un établissement, en essayant plusieurs formulations.
 *
 * Nominatim compare des chaînes : il ne devine pas qu'« AB Business Hôtel » et
 * « AB Business » désignent le même lieu, ni que la casse capitale d'une
 * enseigne n'est pas son nom cartographié. Chaque variante est donc un essai
 * distinct, du plus précis au plus large.
 *
 * L'ordre compte : la première réponse est retenue. Commencer par la variante
 * large ramènerait le quartier au lieu de l'hôtel.
 */
async function geocode(name) {
  const bare = name
    .replace(/\b(h[oô]tel|auberge|r[eé]sidence|hostel|suites?|resort)\b/gi, ' ')
    .replace(/\bnouakchott\b|\bnkc\b/gi, ' ')
    .replace(/[()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const variants = [
    `${name}, Nouakchott, Mauritanie`,
    `${name}, Mauritanie`,
    bare && bare !== name ? `hôtel ${bare}, Nouakchott, Mauritanie` : null,
    bare && bare !== name ? `${bare}, Nouakchott` : null,
  ].filter(Boolean);

  /**
   * Meilleur résultat trouvé jusqu'ici dont le nom ne correspond pas.
   *
   * Conservé pour reconnaître un doublon — voir plus bas —, jamais pour créer.
   */
  let fallback = null;

  for (const variant of variants) {
    // Une requête par seconde, quelle que soit la variante : la limite porte
    // sur les appels, pas sur les noms cherchés.
    await wait(1_100);
    const found = await search(variant);
    if (!found) continue;

    // Un homonyme hors de l'agglomération n'est pas l'établissement demandé.
    // Voir NOUAKCHOTT_RADIUS_METERS.
    const distance = metersBetween(found, NOUAKCHOTT_CENTER);
    if (distance > NOUAKCHOTT_RADIUS_METERS) {
      console.log(
        `  écarté   ${name} : « ${found.displayName?.slice(0, 60)} » à ` +
          `${Math.round(distance / 1000)} km de Nouakchott`,
      );
      continue;
    }

    /*
     * Le résultat porte-t-il vraiment le nom cherché ?
     *
     * Pour « Hôtel Mandela » Nominatim a rendu « Hotel Dialali, Rue Nelson
     * Mandela » : un vrai hôtel, dans la bonne ville, mais reconnu sur le nom
     * de sa **rue**. Créer la fiche Mandela à cette adresse aurait produit une
     * confusion indétectable après coup.
     *
     * La réponse ne fait pourtant pas qu'accepter ou rejeter : un résultat au
     * nom différent reste utile pour reconnaître un doublon, puisque la
     * position, elle, est bonne. La retenir permet de dire « déjà en base sous
     * un autre nom » là où un rejet immédiat annoncerait « introuvable » — et
     * ferait chercher en vain un hôtel déjà présent.
     */
    if (sameName(found.name, name)) return { ...found, nameMatches: true };

    // Premier résultat plausible conservé, faute de mieux ; les variantes
    // suivantes peuvent encore rendre une correspondance exacte.
    fallback ??= { ...found, nameMatches: false };
  }

  return fallback;
}

async function run() {
  console.log(`\nCible : ${API}\n`);

  const token = await login();
  const existing = await listAll(token, '/api/hotels');
  console.log(`Hôtels déjà en base : ${existing.length}\n`);

  const counts = { created: 0, duplicate: 0, notFound: 0, failed: 0 };
  const notFound = [];

  for (const name of NAMES) {
    /*
     * Le rapprochement par le nom exige la même ville.
     *
     * « Hotel Oasis » existe à Nouakchott et à Aleg, à deux cent cinquante
     * kilomètres. Sur le seul nom, le second passait pour le premier et
     * l'établissement demandé n'était jamais créé — un manque silencieux, le
     * pire des deux.
     */
    const twin = existing.find(
      (hotel) => sameName(hotel.name, name) && isNouakchott(hotel.address?.city),
    );

    if (twin) {
      console.log(`doublon    ${name}  ->  ${twin.name}`);
      counts.duplicate += 1;
      continue;
    }

    // La temporisation entre appels est tenue par `geocode`, qui en émet
    // plusieurs par nom.
    const place = await geocode(name);

    if (!place) {
      console.log(`introuvable ${name}`);
      counts.notFound += 1;
      notFound.push(name);
      continue;
    }

    // Second filet, après le nom : la position. Voir SAME_PLACE_METERS.
    const neighbour = existing.find((hotel) => {
      const other = coordsOf(hotel);
      return other && metersBetween(place, other) < SAME_PLACE_METERS;
    });

    if (neighbour) {
      console.log(`même lieu  ${name}  ->  ${neighbour.name}`);
      counts.duplicate += 1;
      continue;
    }

    /*
     * Position inconnue de la base, mais nom différent de celui cherché : on ne
     * crée rien.
     *
     * C'est le cas d'« Hôtel Mandela » et de « Hotel Dialali, Rue Nelson
     * Mandela ». Créer ici reviendrait à inscrire un établissement sous le nom
     * d'un autre — l'erreur la plus coûteuse de tout cet import, puisque rien
     * dans la fiche produite ne la signalerait.
     */
    if (!place.nameMatches) {
      console.log(`  écarté   ${name} : « ${place.name} » ne porte pas ce nom`);
      counts.notFound += 1;
      notFound.push(name);
      continue;
    }

    if (DRY_RUN) {
      /*
       * Le libellé rendu par Nominatim est affiché, et non seulement les
       * coordonnées : c'est le seul moyen de voir qu'une recherche élargie a
       * ramené une supérette ou une mosquée plutôt que l'hôtel cherché. Deux
       * nombres n'auraient rien laissé paraître.
       */
      console.log(
        `à créer    ${name}\n           ${place.displayName?.slice(0, 90)}\n` +
          `           (${place.latitude.toFixed(4)}, ${place.longitude.toFixed(4)})`,
      );
      counts.created += 1;
      /*
       * L'essai à blanc alimente lui aussi la liste des fiches connues, faute
       * de quoi il ne verrait aucun doublon *entre* les noms demandés — et
       * annoncerait deux créations là où la vraie exécution n'en fera qu'une.
       */
      existing.push({
        name,
        address: { city: place.city },
        location: { type: 'Point', coordinates: [place.longitude, place.latitude] },
      });
      continue;
    }

    const { status, payload } = await call(token, '/api/hotels', 'POST', {
      name,
      /*
       * Aucune description ne vient de la source : Nominatim rend une position,
       * pas un texte de présentation. Mieux vaut l'annoncer que broder une
       * prose flatteuse sur un établissement dont on ne sait rien.
       */
      description:
        `${name}, à ${place.city}. Fiche créée à partir des données ` +
        'OpenStreetMap ; description et équipements restent à compléter ' +
        'auprès de l’établissement.',
      address: {
        street: place.street,
        city: place.city,
        country: 'Mauritanie',
        countryCode: 'MR',
      },
      location: { type: 'Point', coordinates: [place.longitude, place.latitude] },
      /*
       * La devise est exigée par le schéma, sans valeur par défaut : elle fixe
       * l'unité de tous les tarifs de l'établissement, et la déduire du pays
       * serait faux dès le premier hôtel qui affiche ses prix en euros.
       *
       * L'ouguiya, seule des trois valeurs admises qui ait un sens ici.
       */
      currency: 'MRU',
      // Publié d'emblée : ces fiches ont été demandées nommément, les laisser en
      // brouillon imposerait une seconde passe sans rien vérifier de plus.
      status: 'PUBLISHED',
    });

    if (status === 201) {
      console.log(
        `créé       ${name}  (${place.latitude.toFixed(4)}, ${place.longitude.toFixed(4)})`,
      );
      counts.created += 1;
      // Évite qu'un doublon interne à la liste soit créé deux fois.
      existing.push(payload.data);
    } else {
      /*
       * Le détail du refus est affiché, pas seulement le code.
       *
       * Un « HTTP 422 » seul n'apprend rien : il a fallu rejouer la requête à
       * la main pour découvrir qu'il manquait la devise. L'essai à blanc
       * n'envoie rien, donc il ne peut pas révéler ce genre de manque — la
       * première exécution réelle est le seul moment où le schéma se prononce.
       */
      const detail = payload?.error?.fields
        ? Object.entries(payload.error.fields)
            .map(([field, messages]) => `${field} : ${[].concat(messages).join(', ')}`)
            .join(' | ')
        : (payload?.error?.message ?? '');

      console.log(`échec      ${name}  HTTP ${status}${detail ? `  ${detail}` : ''}`);
      counts.failed += 1;
    }
  }

  console.log('\nRésultat');
  console.log(`  Créés       : ${counts.created}`);
  console.log(`  Déjà là     : ${counts.duplicate}`);
  console.log(`  Introuvables: ${counts.notFound}`);
  console.log(`  Échecs      : ${counts.failed}`);

  if (notFound.length > 0) {
    console.log(
      '\nCes établissements ne figurent pas dans OpenStreetMap. Aucune position\n' +
        'n’a été inventée pour eux : il faut soit les saisir à la main depuis le\n' +
        'tableau de bord, soit les cartographier sur openstreetmap.org — ce qui\n' +
        'profite alors à tout le monde.\n',
    );
    notFound.forEach((name) => console.log(`  ${name}`));
    console.log('');
  }
}

run().catch((error) => {
  console.error('\nÉchec :', error.message);
  process.exit(1);
});
