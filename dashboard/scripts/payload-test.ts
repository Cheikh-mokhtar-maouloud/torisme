/**
 * Tests des constructeurs de corps de requête.
 *
 * Usage : `npm run test:payloads --workspace dashboard` (backend démarré).
 *
 * Deux niveaux de vérification :
 *  1. la conversion `FormData` → corps JSON, en particulier l'ordre des
 *     coordonnées GeoJSON, seule erreur de ce module qui ne lèverait aucune
 *     exception tout en plaçant un lieu à des milliers de kilomètres ;
 *  2. l'acceptation réelle du corps produit par l'API, afin que le formulaire
 *     et le schéma Zod du backend ne divergent pas silencieusement.
 */
import {
  buildAttractionPayload,
  buildExcursionPayload,
  buildHotelPayload,
  buildRestaurantPayload,
  buildRoomPayload,
} from '../src/lib/payloads';

const BACKEND = process.env.SMOKE_BACKEND_URL ?? 'http://localhost:4000';

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail?: unknown): void {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${label}`);
    if (detail !== undefined) console.log(`        ${JSON.stringify(detail).slice(0, 300)}`);
  }
}

function form(values: Record<string, string | string[]>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    if (Array.isArray(value)) value.forEach((item) => data.append(key, item));
    else data.set(key, value);
  }
  return data;
}

const PLACE_FIELDS = {
  name: 'Test payload',
  description: 'Description suffisamment longue pour passer la validation.',
  city: 'Nouakchott',
  country: 'Mauritanie',
  countryCode: 'MR',
  latitude: '18.0735',
  longitude: '-15.9582',
  status: 'DRAFT',
};

async function run(): Promise<void> {
  console.log('\nConversion FormData → corps de requête\n');

  /* --- Ordre des coordonnées ------------------------------------------------ */
  const hotel = buildHotelPayload(form({ ...PLACE_FIELDS, currency: 'MRU' }));

  check(
    'GeoJSON place la longitude en premier',
    hotel.location.coordinates[0] === -15.9582,
    hotel.location.coordinates,
  );
  check(
    'GeoJSON place la latitude en second',
    hotel.location.coordinates[1] === 18.0735,
    hotel.location.coordinates,
  );

  /* --- Champs dérivés absents ----------------------------------------------- */
  check(
    'Le corps hôtel ne contient pas de champ dérivé',
    !('rating' in hotel) && !('minPricePerNight' in hotel),
  );

  const excursion = buildExcursionPayload(
    form({
      ...PLACE_FIELDS,
      title: 'Excursion test',
      destination: 'Atar',
      startsAt: '2027-03-15T08:30',
      durationMinutes: '480',
      price: '25000',
      currency: 'MRU',
      totalSeats: '20',
      status: 'SCHEDULED',
    }),
  );

  check('Le corps excursion n’envoie pas availableSeats', !('availableSeats' in excursion));
  check(
    'La date locale est convertie en ISO 8601',
    typeof excursion.startsAt === 'string' && excursion.startsAt.endsWith('Z'),
    excursion.startsAt,
  );

  /* --- Listes et cases à cocher --------------------------------------------- */
  const hotelWithLists = buildHotelPayload(
    form({ ...PLACE_FIELDS, currency: 'MRU', amenities: 'wifi, piscine , parking' }),
  );
  check(
    'Une liste séparée par des virgules est découpée et nettoyée',
    JSON.stringify(hotelWithLists.amenities) === JSON.stringify(['wifi', 'piscine', 'parking']),
    hotelWithLists.amenities,
  );

  const restaurant = buildRestaurantPayload(
    form({
      ...PLACE_FIELDS,
      priceRange: '2',
      categoryIds: ['aaaaaaaaaaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbbbbbbbbbb'],
    }),
  );
  check(
    'Les cases à cocher produisent un tableau d’identifiants',
    restaurant.categoryIds.length === 2,
    restaurant.categoryIds,
  );

  /* --- Attraction gratuite --------------------------------------------------- */
  const freeAttraction = buildAttractionPayload(form({ ...PLACE_FIELDS, currency: 'MRU' }));
  check(
    'Une attraction sans tarif n’envoie pas de devise',
    !('currency' in freeAttraction),
    freeAttraction,
  );

  const paidAttraction = buildAttractionPayload(
    form({ ...PLACE_FIELDS, entryFee: '1500', currency: 'MRU' }),
  );
  check('Une attraction payante envoie sa devise', paidAttraction.currency === 'MRU');

  /* --- Acceptation par l'API ------------------------------------------------- */
  console.log('\nAcceptation des corps par l’API\n');

  const token = await login();
  if (!token) {
    console.log('  (backend injoignable — vérifications API ignorées)');
    return report();
  }

  const created: Array<{ path: string; id: string }> = [];

  const hotelId = await postAndCheck('/api/hotels', hotel, token, 'hôtel');
  if (hotelId) created.push({ path: '/api/hotels', id: hotelId });

  if (hotelId) {
    const room = { ...buildRoomPayload(form(ROOM_FIELDS)), hotelId };
    const roomId = await postAndCheck('/api/rooms', room, token, 'chambre');
    if (roomId) created.unshift({ path: '/api/rooms', id: roomId });
  }

  const restaurantId = await postAndCheck(
    '/api/restaurants',
    buildRestaurantPayload(form({ ...PLACE_FIELDS, priceRange: '2' })),
    token,
    'restaurant',
  );
  if (restaurantId) created.push({ path: '/api/restaurants', id: restaurantId });

  const attractionId = await postAndCheck('/api/attractions', freeAttraction, token, 'attraction');
  if (attractionId) created.push({ path: '/api/attractions', id: attractionId });

  const excursionId = await postAndCheck('/api/excursions', excursion, token, 'excursion');
  if (excursionId) created.push({ path: '/api/excursions', id: excursionId });

  // Nettoyage : le test ne doit pas laisser de données derrière lui.
  // Les chambres sont supprimées avant leur hôtel, qui les protège sinon.
  for (const entry of created) {
    await fetch(`${BACKEND}${entry.path}/${entry.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
  }
  console.log(`\n  (${created.length} enregistrement(s) de test supprimé(s))`);

  report();
}

const ROOM_FIELDS = {
  name: 'Chambre test',
  description: 'Description suffisamment longue pour passer la validation.',
  capacity: '2',
  bedCount: '1',
  pricePerNight: '15000',
  currency: 'MRU',
  totalUnits: '3',
  status: 'DRAFT',
};

async function login(): Promise<string> {
  try {
    const response = await fetch(`${BACKEND}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@tourism.mr', password: 'Admin123!' }),
    });
    const payload = (await response.json()) as { data?: { token?: string } };
    return payload.data?.token ?? '';
  } catch {
    return '';
  }
}

async function postAndCheck(
  path: string,
  body: unknown,
  token: string,
  label: string,
): Promise<string> {
  const response = await fetch(`${BACKEND}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as {
    success?: boolean;
    data?: { id?: string };
    error?: unknown;
  };

  check(
    `Le corps « ${label} » est accepté par l’API (201)`,
    response.status === 201,
    payload.error,
  );

  return payload.data?.id ?? '';
}

function report(): void {
  console.log(`\n${passed} réussis, ${failed} échoués\n`);
  if (failed > 0) process.exit(1);
}

run().catch((error: unknown) => {
  console.error('Le test des corps de requête a échoué :', error);
  process.exit(1);
});
