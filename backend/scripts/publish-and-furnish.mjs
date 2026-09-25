/**
 * Publication des lieux importés et création de leurs chambres.
 *
 * Usage :
 *   node backend/scripts/publish-and-furnish.mjs [--dry-run]
 *
 * ─── Ce que ce script invente, et ce qu'il ne touche pas ────────────────────
 *
 * OpenStreetMap ne donne aucun tarif, aucune capacité, aucun équipement. Les
 * chambres créées ici sont donc **fabriquées** : leurs prix, leurs noms et leur
 * nombre ne proviennent d'aucune source.
 *
 * C'est acceptable pour faire fonctionner une démonstration ; ce ne l'est pas
 * pour une mise en ligne publique. Ces établissements existent réellement :
 * afficher « 18 000 MRU la nuit » sur un hôtel qui n'a jamais annoncé ce prix
 * trompe le voyageur et nuit à l'établissement, qui n'a rien demandé.
 *
 * Chaque chambre le dit dans sa description, et le script le répète à la fin.
 *
 * En revanche, rien de ce qui vient d'OpenStreetMap n'est modifié : les noms,
 * adresses, coordonnées et téléphones restent ceux de la source.
 */

const API = process.env.SMOKE_BASE_URL ?? 'https://localhost';
const EMAIL = process.env.ADMIN_EMAIL ?? 'admin@tourism.mr';
const PASSWORD = process.env.ADMIN_PASSWORD ?? 'Admin123!';

const DRY_RUN = process.argv.includes('--dry-run');

if (API.includes('localhost')) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

/**
 * Gammes de chambres.
 *
 * Trois niveaux plutôt qu'un seul : une fiche d'hôtel avec une seule chambre
 * n'a pas de sens pour le voyageur, qui vient précisément comparer. Les écarts
 * de prix suivent la logique du marché — une suite vaut environ le double d'une
 * chambre simple — sans prétendre refléter un établissement particulier.
 */
const ROOM_TYPES = [
  {
    name: 'Chambre simple',
    description:
      'Chambre pour une personne, avec salle d’eau privative. ' +
      'Tarif indicatif, à confirmer auprès de l’établissement.',
    capacity: 1,
    bedCount: 1,
    amenities: ['climatisation', 'wifi'],
    factor: 1,
    totalUnits: 6,
  },
  {
    name: 'Chambre double',
    description:
      'Chambre pour deux personnes, lit double, salle d’eau privative. ' +
      'Tarif indicatif, à confirmer auprès de l’établissement.',
    capacity: 2,
    bedCount: 1,
    amenities: ['climatisation', 'wifi', 'télévision'],
    factor: 1.5,
    totalUnits: 8,
  },
  {
    name: 'Suite familiale',
    description:
      'Deux pièces communicantes pour quatre personnes, salle d’eau privative. ' +
      'Tarif indicatif, à confirmer auprès de l’établissement.',
    capacity: 4,
    bedCount: 2,
    amenities: ['climatisation', 'wifi', 'télévision', 'réfrigérateur'],
    factor: 2.4,
    totalUnits: 3,
  },
];

/**
 * Tarif de base selon la ville.
 *
 * Nouakchott et Nouadhibou concentrent les établissements d'affaires et
 * pratiquent des prix plus élevés que l'intérieur du pays. Cela reste une
 * approximation, mais un tarif unique pour tout le territoire serait plus faux
 * encore.
 */
function basePrice(city) {
  const normalised = (city ?? '').toLowerCase();
  if (normalised.includes('nouakchott')) return 12_000;
  if (normalised.includes('nouadhibou')) return 10_000;
  if (normalised.includes('atar') || normalised.includes('chinguetti')) return 9_000;
  return 7_000;
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

  // La limitation de débit est attendue : ce script écrit vite et en volume.
  if (response.status === 429) {
    await new Promise((resolve) => setTimeout(resolve, 20_000));
    return call(token, path, method, body);
  }

  const payload = await response.json().catch(() => ({}));
  return { status: response.status, payload };
}

/** Parcourt une ressource paginée jusqu'au bout. */
async function listAll(token, path) {
  const items = [];
  let page = 1;

  for (;;) {
    const { payload } = await call(token, `${path}?page=${page}&limit=100`, 'GET');
    const batch = payload?.data?.items ?? [];
    items.push(...batch);

    if (!payload?.data?.meta?.hasNextPage) break;
    page += 1;
  }

  return items;
}

async function run() {
  console.log(`\nCible : ${API}\n`);

  const token = await login();

  /* --- Publication ---------------------------------------------------------- */

  const counts = { published: 0, rooms: 0, skipped: 0, failed: 0 };

  for (const [resource, path] of [
    ['Hôtels', '/api/hotels'],
    ['Restaurants', '/api/restaurants'],
    ['Sites', '/api/attractions'],
  ]) {
    const all = await listAll(token, path);
    const drafts = all.filter((item) => item.status === 'DRAFT');

    console.log(`${resource} : ${all.length} au total, ${drafts.length} en brouillon`);

    for (const item of drafts) {
      /*
       * Un lieu sans coordonnées ne serait ni cartographiable ni trouvable par
       * proximité : le publier reviendrait à l'ajouter aux listes sans qu'il
       * soit atteignable autrement.
       */
      if (!item.location?.coordinates?.length || !item.address?.city) {
        counts.skipped += 1;
        continue;
      }

      if (DRY_RUN) {
        counts.published += 1;
        continue;
      }

      /*
       * `PUT`, et non `PATCH` : c'est la méthode que les routes exposent. Le
       * schéma de mise à jour étant partiel, n'envoyer que le statut suffit et
       * ne remet aucun autre champ à sa valeur par défaut.
       */
      const { status } = await call(token, `${path}/${item.id}`, 'PUT', {
        status: 'PUBLISHED',
      });

      if (status === 200) counts.published += 1;
      else counts.failed += 1;
    }
  }

  /* --- Chambres ------------------------------------------------------------- */

  const hotels = await listAll(token, '/api/hotels');
  const rooms = await listAll(token, '/api/rooms');

  // Les hôtels déjà pourvus sont laissés tels quels : relancer le script ne doit
  // pas créer trois chambres de plus à chaque fois.
  const furnished = new Set(rooms.map((room) => room.hotelId));
  const toFurnish = hotels.filter((hotel) => !furnished.has(hotel.id));

  console.log(`\nChambres : ${toFurnish.length} hôtels sans chambre\n`);

  for (const hotel of toFurnish) {
    const base = basePrice(hotel.address?.city);

    for (const type of ROOM_TYPES) {
      if (DRY_RUN) {
        counts.rooms += 1;
        continue;
      }

      const { status } = await call(token, '/api/rooms', 'POST', {
        hotelId: hotel.id,
        name: type.name,
        description: type.description,
        capacity: type.capacity,
        bedCount: type.bedCount,
        amenities: type.amenities,
        // Arrondi au millier : un prix comme « 18 000 MRU » se lit et se retient,
        // là où « 17 640 » donnerait une fausse impression de précision.
        pricePerNight: Math.round((base * type.factor) / 1000) * 1000,
        currency: 'MRU',
        totalUnits: type.totalUnits,
        status: 'PUBLISHED',
      });

      if (status === 201) counts.rooms += 1;
      else counts.failed += 1;
    }

    if (counts.rooms > 0 && counts.rooms % 60 === 0) {
      console.log(`  ${counts.rooms} chambres créées…`);
    }
  }

  console.log('\nRésultat');
  console.log(`  Lieux publiés   : ${counts.published}`);
  console.log(`  Chambres créées : ${counts.rooms}`);
  console.log(`  Ignorés         : ${counts.skipped}`);
  console.log(`  Échecs          : ${counts.failed}`);

  console.log(
    '\nAVERTISSEMENT — Les tarifs des chambres sont inventés. Aucun ne provient\n' +
      'de l’établissement concerné, qui existe réellement. Ils conviennent à une\n' +
      'démonstration ; ils doivent être remplacés par les prix réels avant toute\n' +
      'ouverture au public.\n',
  );
}

run().catch((error) => {
  console.error('\nÉchec :', error.message);
  process.exit(1);
});
