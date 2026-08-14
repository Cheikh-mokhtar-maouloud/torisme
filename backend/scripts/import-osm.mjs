/**
 * Import de lieux depuis OpenStreetMap.
 *
 * Usage :
 *   node backend/scripts/import-osm.mjs [--dry-run] [--limit=50]
 *
 * ─── Pourquoi OpenStreetMap et pas Booking, TripAdvisor ou Google ───────────
 *
 * Les fiches de ces plateformes, et surtout leurs photographies, appartiennent
 * aux établissements ou aux photographes. Les recopier dans une plateforme
 * touristique concurrente est une contrefaçon, pas une zone grise, et leurs
 * conditions d'utilisation interdisent explicitement l'extraction automatisée.
 *
 * OpenStreetMap est sous licence ODbL : la réutilisation commerciale est
 * autorisée, à condition de citer la source. C'est déjà le fond de carte de
 * l'application, la cohérence est donc totale.
 *
 * ─── Ce que cette source donne, et ce qu'elle ne donne pas ──────────────────
 *
 * Elle donne : le nom, les coordonnées exactes, souvent la ville, la rue, le
 * téléphone, parfois le site web et le nombre d'étoiles.
 *
 * Elle ne donne **pas** de descriptions ni de photographies. Les descriptions
 * écrites ici sont donc strictement factuelles, construites à partir des
 * étiquettes : « Hôtel situé à Nouadhibou, rue de la plage Raha. » Inventer un
 * texte d'ambiance reviendrait à publier sous votre nom des affirmations que
 * personne n'a vérifiées — sur des établissements réels, qui existent.
 *
 * Les photographies ne sont récupérées que depuis Wikimedia Commons, pour les
 * lieux qui y sont reliés par une étiquette `wikidata`. Ce sont des images sous
 * licence libre. Concrètement, cela ne concerne que quelques sites classés :
 * les hôtels et restaurants n'auront pas de photo, et l'application affiche
 * alors « Photo à venir », ce qui est honnête.
 *
 * ─── Statut des fiches importées ────────────────────────────────────────────
 *
 * Tout est créé en **brouillon**. Une donnée collaborative n'est pas vérifiée :
 * un restaurant peut avoir fermé, un nom être mal orthographié. Publier
 * directement afficherait aux voyageurs des informations dont personne n'a
 * répondu. Le tri se fait depuis le dashboard.
 */

const API = process.env.SMOKE_BASE_URL ?? 'https://localhost';
const EMAIL = process.env.ADMIN_EMAIL ?? 'admin@tourism.mr';
const PASSWORD = process.env.ADMIN_PASSWORD ?? 'Admin123!';

const DRY_RUN = process.argv.includes('--dry-run');
const LIMIT = Number(process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1] ?? Infinity);

if (API.includes('localhost')) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const OVERPASS = 'https://overpass-api.de/api/interpreter';

/**
 * Identification auprès des services d'OpenStreetMap.
 *
 * Overpass **et** Nominatim l'exigent : le premier refuse par 406 un agent
 * anonyme, le second bannit l'adresse IP. Un import qui ne se nomme pas est un
 * import qui finit par ne plus fonctionner.
 */
const USER_AGENT = 'tourism-platform-import/1.0 (import ponctuel de lieux mauritaniens)';

const QUERY = `[out:json][timeout:120];
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

/* -------------------------------------------------------------------------- */
/* Classification                                                              */
/* -------------------------------------------------------------------------- */

function classify(tags) {
  if (tags.tourism === 'hotel' || tags.tourism === 'guest_house') return 'hotel';
  if (tags.amenity === 'restaurant' || tags.amenity === 'cafe') return 'restaurant';
  if (tags.tourism === 'attraction' || tags.tourism === 'museum' || tags.historic) {
    return 'attraction';
  }
  return null;
}

/**
 * Libellé français du type de lieu, employé dans la description.
 *
 * Les étiquettes OSM sont en anglais et techniques (`guest_house`,
 * `archaeological_site`) : les afficher telles quelles à un voyageur
 * francophone n'aurait aucun sens.
 */
function frenchKind(tags) {
  if (tags.tourism === 'hotel') return 'Hôtel';
  if (tags.tourism === 'guest_house') return 'Maison d’hôtes';
  if (tags.amenity === 'cafe') return 'Café';
  if (tags.amenity === 'restaurant') return 'Restaurant';
  if (tags.tourism === 'museum') return 'Musée';
  if (tags.historic === 'archaeological_site') return 'Site archéologique';
  if (tags.historic === 'ruins') return 'Ruines';
  if (tags.historic === 'fort') return 'Fort';
  if (tags.historic) return 'Site historique';
  return 'Site touristique';
}

/**
 * Description factuelle.
 *
 * Chaque phrase découle d'une étiquette présente dans la donnée. Le minimum de
 * dix caractères imposé par le schéma est toujours atteint par la première
 * phrase, qui combine au moins le type et la ville.
 */
function describe(tags, city) {
  const parts = [`${frenchKind(tags)} situé à ${city}`];

  if (tags['addr:street']) parts.push(`, ${tags['addr:street']}`);
  parts.push('.');

  if (tags.cuisine) {
    const cuisines = tags.cuisine
      .split(';')
      .map((c) => c.replace(/_/g, ' '))
      .join(', ');
    parts.push(` Cuisine : ${cuisines}.`);
  }
  if (tags.stars) parts.push(` Classement annoncé : ${tags.stars} étoile(s).`);
  if (tags.phone || tags['contact:phone']) {
    parts.push(` Téléphone : ${tags.phone ?? tags['contact:phone']}.`);
  }
  if (tags.website || tags['contact:website']) {
    parts.push(` Site : ${tags.website ?? tags['contact:website']}.`);
  }

  parts.push(' Fiche importée depuis OpenStreetMap, à vérifier avant publication.');

  return parts.join('');
}

/* -------------------------------------------------------------------------- */
/* Ville : étiquette, sinon géocodage inverse                                  */
/* -------------------------------------------------------------------------- */

const cityCache = new Map();

/**
 * Nominatim impose **une requête par seconde**, et un agent utilisateur
 * identifiable. Dépasser ce rythme fait bannir l'adresse IP — ce serait
 * pénaliser tout le poste pour un import unique.
 */
async function reverseCity(lat, lon) {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  if (cityCache.has(key)) return cityCache.get(key);

  await new Promise((resolve) => setTimeout(resolve, 1100));

  try {
    const url =
      `https://nominatim.openstreetmap.org/reverse?format=json&zoom=10` +
      `&lat=${lat}&lon=${lon}&accept-language=fr`;

    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
    });

    if (!response.ok) return null;

    const data = await response.json();
    const a = data.address ?? {};
    const city = a.city ?? a.town ?? a.village ?? a.municipality ?? a.county ?? a.state ?? null;

    cityCache.set(key, city);
    return city;
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Photographies libres                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Image depuis Wikimedia Commons, via l'identifiant Wikidata.
 *
 * C'est la seule source d'images à la fois pertinente et librement
 * réutilisable. Elle ne couvre que des lieux notables — quelques sites classés
 * pour la Mauritanie — et c'est assumé : mieux vaut aucune photo qu'une photo
 * empruntée à un site commercial.
 */
async function fetchWikimediaImage(wikidataId) {
  try {
    const entity = await fetch(
      `https://www.wikidata.org/wiki/Special:EntityData/${wikidataId}.json`,
    ).then((r) => (r.ok ? r.json() : null));

    const claims = entity?.entities?.[wikidataId]?.claims?.P18;
    const fileName = claims?.[0]?.mainsnak?.datavalue?.value;
    if (!fileName) return null;

    // Passage par Special:FilePath : l'URL directe exige de calculer une
    // empreinte MD5 du nom de fichier, que ce point d'entrée gère lui-même.
    return {
      url: `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(fileName)}?width=1200`,
      alt: `${fileName.replace(/_/g, ' ')} — Wikimedia Commons`,
      order: 0,
    };
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* API                                                                          */
/* -------------------------------------------------------------------------- */

async function login() {
  const response = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });

  const payload = await response.json();
  const token = payload?.data?.token;

  if (!token) throw new Error(`Connexion impossible : ${JSON.stringify(payload).slice(0, 200)}`);
  return token;
}

async function create(token, path, body) {
  const response = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });

  if (response.status === 429) return { status: 429 };

  const payload = await response.json().catch(() => ({}));
  return { status: response.status, payload };
}

/* -------------------------------------------------------------------------- */

async function run() {
  console.log(`\nCible : ${API}`);
  console.log('Source : OpenStreetMap (ODbL) + Wikimedia Commons\n');

  console.log('Interrogation d’Overpass…');
  /*
   * L'agent utilisateur est **obligatoire**, et c'est le seul point qui compte.
   *
   * Overpass refuse par 406 l'agent par défaut de Node : c'est un filtre
   * anti-robot. Le code de réponse est trompeur — « non acceptable » évoque un
   * problème de format ou une surcharge du service, ce qui pousse à modifier la
   * requête ou à réessayer, alors qu'il suffit de se nommer.
   *
   * S'identifier est de toute façon ce que demande leur politique d'usage.
   */
  const overpass = await fetch(OVERPASS, {
    method: 'POST',
    headers: {
      'User-Agent': USER_AGENT,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: QUERY,
  });

  if (!overpass.ok) {
    console.error(`Overpass a répondu ${overpass.status}. Réessayez dans quelques minutes.`);
    process.exit(1);
  }

  const { elements = [] } = await overpass.json();

  // Un lieu sans nom n'est pas présentable dans une application : on ne l'importe
  // pas plutôt que d'inventer un libellé.
  const usable = elements
    .filter((element) => element.tags?.name)
    .map((element) => ({
      tags: element.tags,
      latitude: element.lat ?? element.center?.lat,
      longitude: element.lon ?? element.center?.lon,
    }))
    .filter((place) => place.latitude && place.longitude)
    .slice(0, LIMIT);

  console.log(
    `${elements.length} objets reçus, ${usable.length} exploitables (nommés et situés).\n`,
  );

  const token = DRY_RUN ? null : await login();

  const counts = { hotel: 0, restaurant: 0, attraction: 0, ignored: 0, failed: 0, images: 0 };

  for (const place of usable) {
    const kind = classify(place.tags);
    if (!kind) {
      counts.ignored += 1;
      continue;
    }

    const city = place.tags['addr:city'] ?? (await reverseCity(place.latitude, place.longitude));

    if (!city) {
      counts.ignored += 1;
      continue;
    }

    const images = [];
    if (place.tags.wikidata) {
      const image = await fetchWikimediaImage(place.tags.wikidata);
      if (image) {
        images.push(image);
        counts.images += 1;
      }
    }

    const base = {
      name: place.tags.name.slice(0, 160),
      description: describe(place.tags, city).slice(0, 5000),
      address: {
        ...(place.tags['addr:street'] ? { line1: place.tags['addr:street'].slice(0, 200) } : {}),
        city: city.slice(0, 100),
        country: 'Mauritanie',
        countryCode: 'MR',
      },
      location: { type: 'Point', coordinates: [place.longitude, place.latitude] },
      images,
      // Brouillon : la donnée est collaborative, donc non vérifiée.
      status: 'DRAFT',
    };

    const phone = place.tags.phone ?? place.tags['contact:phone'];

    let path;
    let body;

    if (kind === 'hotel') {
      path = '/api/hotels';
      body = {
        ...base,
        currency: 'MRU',
        ...(phone ? { phone: phone.slice(0, 30) } : {}),
        // Les étoiles ne sont reprises que si OSM les annonce. En inventer
        // reviendrait à noter des établissements réels sans les avoir vus.
        ...(place.tags.stars && /^[1-5]$/.test(place.tags.stars)
          ? { stars: Number(place.tags.stars) }
          : {}),
      };
    } else if (kind === 'restaurant') {
      path = '/api/restaurants';
      body = {
        ...base,
        // 2 sur 4 : valeur médiane, faute d'information. Elle est déclarée dans
        // la description comme provenant de l'import, et reste modifiable.
        priceRange: 2,
        cuisineTypes: place.tags.cuisine
          ? place.tags.cuisine
              .split(';')
              .map((c) => c.replace(/_/g, ' ').slice(0, 60))
              .slice(0, 15)
          : [],
        ...(phone ? { phone: phone.slice(0, 30) } : {}),
      };
    } else {
      path = '/api/attractions';
      body = base;
    }

    if (DRY_RUN) {
      counts[kind] += 1;
      continue;
    }

    let result = await create(token, path, body);

    // La limitation de débit est une réponse normale ici : l'import écrit vite.
    // On patiente au lieu d'abandonner la fiche.
    if (result.status === 429) {
      await new Promise((resolve) => setTimeout(resolve, 20_000));
      result = await create(token, path, body);
    }

    if (result.status === 201) {
      counts[kind] += 1;
    } else if (result.status === 409) {
      // Nom déjà pris : l'import a déjà été lancé, ou le lieu existait.
      counts.ignored += 1;
    } else {
      counts.failed += 1;
      if (counts.failed <= 3) {
        console.log(`  échec ${result.status} — ${place.tags.name}`);
        console.log(`  ${JSON.stringify(result.payload?.error ?? {}).slice(0, 200)}`);
      }
    }

    const done = counts.hotel + counts.restaurant + counts.attraction;
    if (done > 0 && done % 25 === 0) console.log(`  ${done} fiches créées…`);
  }

  console.log('\nRésultat');
  console.log(`  Hôtels et maisons d’hôtes : ${counts.hotel}`);
  console.log(`  Restaurants et cafés      : ${counts.restaurant}`);
  console.log(`  Sites et monuments        : ${counts.attraction}`);
  console.log(`  Photos libres trouvées    : ${counts.images}`);
  console.log(`  Ignorés (sans ville, ou déjà présents) : ${counts.ignored}`);
  console.log(`  Échecs                    : ${counts.failed}`);

  console.log(
    '\nTout est en brouillon. Relisez depuis le dashboard avant publication :\n' +
      'la donnée est collaborative, donc non vérifiée — un établissement peut\n' +
      'avoir fermé, un nom être mal orthographié.\n',
  );

  console.log('Attribution obligatoire (ODbL) : « Données © contributeurs OpenStreetMap ».\n');
}

run().catch((error) => {
  console.error('\nL’import a échoué :', error.message);
  process.exit(1);
});
