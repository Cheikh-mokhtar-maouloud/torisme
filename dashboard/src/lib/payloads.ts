import { list, number, text } from './forms';

/**
 * Construction des corps de requête à partir des données de formulaire.
 *
 * Ces fonctions sont volontairement **pures** et sorties des fichiers
 * `'use server'` : elles concentrent la logique la plus facile à casser
 * (correspondance des champs, ordre des coordonnées) et deviennent ainsi
 * testables isolément, sans contexte de requête ni serveur démarré.
 */

/**
 * Convertit la saisie latitude/longitude en point GeoJSON.
 *
 * Le formulaire présente la latitude en premier — l'ordre qu'un humain lit sur
 * une carte — alors que GeoJSON attend `[longitude, latitude]`. L'inversion est
 * faite ici, et uniquement ici : dupliquée dans chaque module, elle finirait
 * par être oubliée quelque part, plaçant un lieu à l'autre bout du globe sans
 * qu'aucune validation ne s'en aperçoive.
 */
export function buildGeoPoint(data: FormData) {
  return {
    type: 'Point' as const,
    coordinates: [number(data, 'longitude'), number(data, 'latitude')],
  };
}

export function buildAddress(data: FormData) {
  return {
    line1: text(data, 'line1'),
    city: text(data, 'city'),
    region: text(data, 'region'),
    country: text(data, 'country'),
    countryCode: text(data, 'countryCode'),
  };
}

export function buildHotelPayload(data: FormData) {
  return {
    name: text(data, 'name'),
    description: text(data, 'description'),
    address: buildAddress(data),
    location: buildGeoPoint(data),
    stars: number(data, 'stars'),
    amenities: list(data, 'amenities'),
    rules: list(data, 'rules'),
    checkInTime: text(data, 'checkInTime'),
    checkOutTime: text(data, 'checkOutTime'),
    phone: text(data, 'phone'),
    currency: text(data, 'currency'),
    status: text(data, 'status'),
  };
}

export function buildRoomPayload(data: FormData) {
  return {
    name: text(data, 'name'),
    description: text(data, 'description'),
    capacity: number(data, 'capacity'),
    bedCount: number(data, 'bedCount'),
    amenities: list(data, 'amenities'),
    pricePerNight: number(data, 'pricePerNight'),
    currency: text(data, 'currency'),
    totalUnits: number(data, 'totalUnits'),
    status: text(data, 'status'),
  };
}

export function buildRestaurantPayload(data: FormData) {
  return {
    name: text(data, 'name'),
    description: text(data, 'description'),
    address: buildAddress(data),
    location: buildGeoPoint(data),
    cuisineTypes: list(data, 'cuisineTypes'),
    priceRange: number(data, 'priceRange'),
    phone: text(data, 'phone'),
    menuUrl: text(data, 'menuUrl'),
    categoryIds: readCategoryIds(data),
    status: text(data, 'status'),
  };
}

export function buildAttractionPayload(data: FormData) {
  const entryFee = number(data, 'entryFee');

  return {
    name: text(data, 'name'),
    description: text(data, 'description'),
    address: buildAddress(data),
    location: buildGeoPoint(data),
    categoryIds: readCategoryIds(data),
    entryFee,
    // La devise n'accompagne le tarif que s'il existe : l'envoyer seule
    // afficherait « MRU » sur une attraction gratuite.
    ...(entryFee ? { currency: text(data, 'currency') } : {}),
    status: text(data, 'status'),
  };
}

export function buildExcursionPayload(data: FormData) {
  const startsAt = text(data, 'startsAt');

  return {
    title: text(data, 'title'),
    description: text(data, 'description'),
    destination: text(data, 'destination'),
    departureAddress: buildAddress(data),
    departureLocation: buildGeoPoint(data),
    // `datetime-local` fournit une heure sans fuseau ; `new Date()` l'interprète
    // dans le fuseau du serveur, puis l'API la stocke normalisée en UTC.
    startsAt: startsAt ? new Date(startsAt).toISOString() : undefined,
    durationMinutes: number(data, 'durationMinutes'),
    price: number(data, 'price'),
    currency: text(data, 'currency'),
    // `availableSeats` est absent volontairement : les places restantes sont
    // dérivées des réservations et gérées par le serveur.
    totalSeats: number(data, 'totalSeats'),
    guideName: text(data, 'guideName'),
    status: text(data, 'status'),
  };
}

/** Les cases à cocher de catégories partagent un même nom ; `getAll` les relit toutes. */
function readCategoryIds(data: FormData): string[] {
  return data
    .getAll('categoryIds')
    .filter((value): value is string => typeof value === 'string' && value !== '');
}
