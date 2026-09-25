/**
 * Création des excursions.
 *
 * Usage :
 *   node backend/scripts/seed-excursions.mjs [--dry-run] [--remove]
 *
 * ─── Pourquoi celui-ci ne « scrape » rien ───────────────────────────────────
 *
 * Les hôtels, restaurants et sites ont pu être importés parce que ce sont des
 * **lieux** : OpenStreetMap les cartographie, avec un nom et des coordonnées.
 *
 * Une excursion n'est pas un lieu. C'est un produit commercial — une date de
 * départ, un tarif, un nombre de places, un guide — vendu par un voyagiste.
 * Aucune base ouverte ne contient cela, et les fiches de Google Maps, où ces
 * circuits figurent parfois, appartiennent à Google et à leurs auteurs : les
 * extraire est interdit par ses conditions d'utilisation.
 *
 * ─── Ce que ce script fait à la place ───────────────────────────────────────
 *
 * Il construit des circuits vers les destinations **réelles** déjà présentes
 * dans la base : Chinguetti, Ouadane, le Guelb er Richât, le Banc d'Arguin,
 * l'Amogjar. Ces lieux existent, leurs coordonnées viennent d'OpenStreetMap, et
 * les descriptions n'avancent que des faits vérifiables — une ville inscrite au
 * patrimoine mondial, un parc national, une formation géologique.
 *
 * Ce qui est **inventé**, et le reste : les tarifs, les dates, le nombre de
 * places, les horaires d'étape et les noms de guides. Aucun voyagiste n'a
 * annoncé ces prix. C'est acceptable pour une démonstration ; avant toute
 * ouverture au public, ces circuits doivent être remplacés par ceux
 * d'opérateurs réels, avec leurs tarifs.
 *
 * `--remove` retire tout ce que ce script a créé.
 */

const API = process.env.SMOKE_BASE_URL ?? 'https://localhost';
const EMAIL = process.env.ADMIN_EMAIL ?? 'admin@tourism.mr';
const PASSWORD = process.env.ADMIN_PASSWORD ?? 'Admin123!';

const DRY_RUN = process.argv.includes('--dry-run');
const REMOVE = process.argv.includes('--remove');

if (API.includes('localhost')) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

/**
 * Points de départ.
 *
 * Nouakchott pour les circuits longs — c'est là qu'arrivent les vols
 * internationaux. Atar pour l'Adrar, dont il est la porte d'entrée et qui
 * dispose d'un aérodrome. Nouadhibou pour le littoral nord.
 */
const DEPARTURES = {
  nouakchott: {
    coordinates: [-15.9785, 18.0858],
    address: { street: 'Aéroport international', city: 'Nouakchott', country: 'Mauritanie', countryCode: 'MR' },
  },
  atar: {
    coordinates: [-13.0499, 20.5169],
    address: { street: 'Centre-ville', city: 'Atar', country: 'Mauritanie', countryCode: 'MR' },
  },
  nouadhibou: {
    coordinates: [-17.0347, 20.931],
    address: { street: 'Port de pêche', city: 'Nouadhibou', country: 'Mauritanie', countryCode: 'MR' },
  },
};

/**
 * Marqueur permettant de retrouver ces fiches.
 *
 * Placé dans le nom du guide plutôt que dans le titre : il ne doit pas
 * s'afficher au voyageur, et `--remove` doit pouvoir distinguer ces circuits de
 * ceux qu'un opérateur réel aurait saisis ensuite.
 */
const MARKER = 'Circuit de démonstration';

/**
 * Les circuits.
 *
 * `daysFromNow` fixe le départ. La saison touristique mauritanienne va
 * d'octobre à avril : au-delà, les températures de l'Adrar dépassent
 * régulièrement 45 °C et aucun opérateur ne programme de désert. Des départs
 * datés de juillet seraient invraisemblables pour quiconque connaît le pays.
 */
const EXCURSIONS = [
  {
    title: 'Chinguetti et la vallée du Ouadane',
    destination: 'Chinguetti',
    departure: 'atar',
    description:
      'Chinguetti, fondée au XIIIᵉ siècle, fut une étape des caravanes transsahariennes et un ' +
      'foyer d’enseignement religieux. Ses bibliothèques familiales conservent des manuscrits ' +
      'de droit, d’astronomie et de mathématiques. La ville est inscrite au patrimoine mondial ' +
      'de l’UNESCO depuis 1996, avec Ouadane, Tichitt et Oualata.',
    durationMinutes: 60 * 24 * 2,
    price: 48_000,
    totalSeats: 12,
    guideName: 'Guide francophone',
    itinerary: [
      { time: '07:00', title: 'Départ d’Atar', description: 'Route vers le plateau de l’Adrar par la passe d’Amogjar.' },
      { time: '10:00', title: 'Vieille ville de Chinguetti', description: 'Quartier ancien, mosquée à minaret carré, ruelles de pierre sèche.' },
      { time: '14:00', title: 'Maison du Livre', description: 'Bibliothèque de manuscrits, présentée par la famille qui en a la garde.' },
      { time: '17:00', title: 'Dunes du soir', description: 'Marche sur le cordon dunaire qui borde la ville à l’est.' },
      { time: '08:00', title: 'Deuxième jour : Ouadane', description: 'Ksar en ruine dominant la palmeraie, ancienne mosquée.' },
      { time: '16:00', title: 'Retour à Atar' },
    ],
    daysFromNow: [58, 79, 100, 128],
  },
  {
    title: 'Guelb er Richât, l’œil du Sahara',
    destination: 'Adrar',
    departure: 'atar',
    description:
      'Structure circulaire de près de quarante kilomètres de diamètre, visible depuis ' +
      'l’orbite terrestre. Longtemps attribuée à un impact météoritique, elle est aujourd’hui ' +
      'expliquée par l’érosion d’un dôme géologique soulevé puis mis à nu. Les anneaux ' +
      'concentriques correspondent à des couches de roches de duretés différentes.',
    durationMinutes: 60 * 10,
    price: 22_000,
    totalSeats: 8,
    guideName: 'Guide géologue',
    itinerary: [
      { time: '06:30', title: 'Départ d’Atar' },
      { time: '09:30', title: 'Bord ouest de la structure', description: 'Montée sur la crête extérieure, lecture des anneaux.' },
      { time: '12:00', title: 'Centre du Richat', description: 'Traversée du cœur de la formation.' },
      { time: '15:00', title: 'Forteresses de Richat', description: 'Vestiges de pierre sur les hauteurs, également en base.' },
      { time: '18:00', title: 'Retour à Atar' },
    ],
    daysFromNow: [61, 75, 96, 117, 145],
  },
  {
    title: 'Parc national du Banc d’Arguin',
    destination: 'Nouadhibou',
    departure: 'nouadhibou',
    description:
      'Le Banc d’Arguin protège 12 000 km² de côte, de vasières et d’îles. C’est l’un des plus ' +
      'importants sites d’hivernage d’oiseaux limicoles au monde : plus de deux millions ' +
      'd’individus y passent la saison froide. Les Imraguen, seule population autorisée à y ' +
      'pêcher, pratiquent une pêche à la voile latine restée quasiment inchangée.',
    durationMinutes: 60 * 9,
    price: 19_000,
    totalSeats: 10,
    guideName: 'Guide ornithologue',
    itinerary: [
      { time: '07:00', title: 'Départ de Nouadhibou' },
      { time: '09:30', title: 'Village imraguen', description: 'Rencontre avec les pêcheurs, sortie en lanche à voile.' },
      { time: '12:00', title: 'Vasières à marée basse', description: 'Observation des limicoles ; jumelles fournies.' },
      { time: '16:00', title: 'Retour à Nouadhibou' },
    ],
    daysFromNow: [55, 69, 90, 111, 132],
  },
  {
    title: 'Train du désert : Nouadhibou – Zouérat',
    destination: 'Zouérat',
    departure: 'nouadhibou',
    description:
      'Le train minéralier de la SNIM relie les mines de fer de Zouérat au port de Nouadhibou ' +
      'sur 704 kilomètres. Avec plus de deux cents wagons, il compte parmi les trains les plus ' +
      'longs du monde. Le voyage se fait sur le minerai à ciel ouvert ou dans l’unique voiture ' +
      'voyageurs. La nuit dans le désert y est glaciale, même en saison chaude.',
    durationMinutes: 60 * 18,
    price: 26_000,
    totalSeats: 6,
    guideName: 'Accompagnateur',
    itinerary: [
      { time: '14:00', title: 'Rendez-vous à Nouadhibou', description: 'Équipement : lunettes, chèche, duvet — la poussière de fer est partout.' },
      { time: '16:00', title: 'Départ du convoi' },
      { time: '22:00', title: 'Traversée de nuit', description: 'Arrêt technique, ciel sans aucune pollution lumineuse.' },
      { time: '08:00', title: 'Arrivée à Zouérat' },
    ],
    daysFromNow: [64, 92, 120, 148],
  },
  {
    title: 'Oasis de Terjit et passe d’Amogjar',
    destination: 'Atar',
    departure: 'atar',
    description:
      'Terjit est une oasis encaissée dans une faille de la falaise de l’Adrar, alimentée par ' +
      'une source permanente qui coule sous les palmiers. La passe d’Amogjar, sur la route de ' +
      'Chinguetti, porte des peintures rupestres néolithiques figurant des bovins et des ' +
      'personnages — témoins d’un Sahara alors humide.',
    durationMinutes: 60 * 8,
    price: 15_000,
    totalSeats: 14,
    guideName: 'Guide local',
    itinerary: [
      { time: '08:00', title: 'Départ d’Atar' },
      { time: '09:30', title: 'Peintures rupestres de l’Amogjar' },
      { time: '12:00', title: 'Oasis de Terjit', description: 'Baignade dans la source, déjeuner sous les palmiers.' },
      { time: '16:00', title: 'Retour à Atar' },
    ],
    daysFromNow: [52, 66, 87, 108, 136],
  },
  {
    title: 'Nouakchott, port de pêche et marché',
    destination: 'Nouakchott',
    departure: 'nouakchott',
    description:
      'Nouakchott n’était qu’un poste de quelques centaines d’habitants lors de l’indépendance ' +
      'en 1960 ; elle en compte aujourd’hui plus d’un million. Le port de pêche artisanale, où ' +
      'les pirogues peintes rentrent en fin d’après-midi et sont hissées à la force des bras, ' +
      'en est le spectacle le plus vivant.',
    durationMinutes: 60 * 5,
    price: 6_000,
    totalSeats: 16,
    guideName: 'Guide urbain',
    itinerary: [
      { time: '15:00', title: 'Marché aux légumes' },
      { time: '16:30', title: 'Port de pêche', description: 'Retour des pirogues, criée, découpe sur la plage.' },
      { time: '18:30', title: 'Coucher de soleil sur l’Atlantique' },
    ],
    daysFromNow: [40, 47, 54, 61, 68, 75],
  },
];

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
    const { payload } = await call(token, `${path}?page=${page}&limit=100&includePast=true`, 'GET');
    items.push(...(payload?.data?.items ?? []));
    if (!payload?.data?.meta?.hasNextPage) break;
  }

  return items;
}

/** Date de départ, à midi UTC pour éviter tout glissement de jour selon le fuseau. */
function departureDate(daysFromNow) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysFromNow);
  date.setUTCHours(12, 0, 0, 0);
  return date.toISOString();
}

function describeFailure(payload) {
  if (payload?.error?.fields) {
    return Object.entries(payload.error.fields)
      .map(([field, messages]) => `${field} : ${[].concat(messages).join(', ')}`)
      .join(' | ');
  }
  return payload?.error?.message ?? '';
}

async function run() {
  console.log(`\nCible : ${API}`);
  console.log(REMOVE ? 'Mode : retrait\n' : 'Mode : création\n');

  const token = await login();
  const existing = await listAll(token, '/api/excursions');

  if (REMOVE) {
    const mine = existing.filter((item) => item.guideName?.includes(MARKER));
    console.log(`${mine.length} circuit(s) de démonstration sur ${existing.length}`);

    let removed = 0;
    for (const item of mine) {
      if (DRY_RUN) {
        removed += 1;
        continue;
      }
      const { status } = await call(token, `/api/excursions/${item.id}`, 'DELETE');
      if (status === 200 || status === 204) removed += 1;
    }

    console.log(`Retirés : ${removed}`);
    return;
  }

  const counts = { created: 0, skipped: 0, failed: 0 };

  for (const excursion of EXCURSIONS) {
    const departure = DEPARTURES[excursion.departure];

    for (const days of excursion.daysFromNow) {
      const startsAt = departureDate(days);

      /*
       * Un même circuit à la même date ne doit pas être créé deux fois : le
       * script doit pouvoir être relancé après un ajout sans dupliquer ce qui
       * existe déjà.
       */
      const duplicate = existing.some(
        (item) => item.title === excursion.title && item.startsAt?.slice(0, 10) === startsAt.slice(0, 10),
      );

      if (duplicate) {
        counts.skipped += 1;
        continue;
      }

      if (DRY_RUN) {
        console.log(`à créer   ${excursion.title.padEnd(40)} ${startsAt.slice(0, 10)}`);
        counts.created += 1;
        continue;
      }

      const { status, payload } = await call(token, '/api/excursions', 'POST', {
        title: excursion.title,
        description: excursion.description,
        destination: excursion.destination,
        departureLocation: { type: 'Point', coordinates: departure.coordinates },
        departureAddress: departure.address,
        itinerary: excursion.itinerary,
        durationMinutes: excursion.durationMinutes,
        startsAt,
        price: excursion.price,
        currency: 'MRU',
        totalSeats: excursion.totalSeats,
        // Le marqueur voyage dans le nom du guide : voir MARKER.
        guideName: `${excursion.guideName} · ${MARKER}`,
        status: 'SCHEDULED',
      });

      if (status === 201) {
        console.log(`créé      ${excursion.title.padEnd(40)} ${startsAt.slice(0, 10)}`);
        counts.created += 1;
        existing.push(payload.data);
      } else {
        console.log(`échec     ${excursion.title}  HTTP ${status}  ${describeFailure(payload)}`);
        counts.failed += 1;
      }
    }
  }

  console.log('\nRésultat');
  console.log(`  Créées   : ${counts.created}`);
  console.log(`  Ignorées : ${counts.skipped}`);
  console.log(`  Échecs   : ${counts.failed}`);

  console.log(
    '\nAVERTISSEMENT — Les destinations sont réelles et leurs descriptions\n' +
      'factuelles. En revanche les tarifs, les dates, les places et les guides\n' +
      'sont inventés : aucun voyagiste ne les a annoncés. Ils conviennent à une\n' +
      'démonstration et doivent être remplacés par l’offre d’opérateurs réels\n' +
      'avant toute ouverture au public.\n' +
      '\nPour les retirer : node backend/scripts/seed-excursions.mjs --remove\n',
  );
}

run().catch((error) => {
  console.error('\nÉchec :', error.message);
  process.exit(1);
});
