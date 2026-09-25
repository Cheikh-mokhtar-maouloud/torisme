/**
 * Calcul d'itinéraire routier.
 *
 * Le service est **OSRM**, dans la continuité du choix d'OpenStreetMap : ni
 * clé, ni compte, ni quota déclaré. Il rend un tracé qui suit réellement les
 * routes, et non la ligne droite — sur Nouakchott, l'écart entre les deux
 * dépasse souvent le double.
 *
 * Réserve à connaître avant une mise en production : `router.project-osrm.org`
 * est un serveur de **démonstration**, sans engagement de disponibilité et sans
 * garantie de débit. Pour une vraie exploitation il faut soit héberger OSRM
 * soi-même — l'image Docker est publique et la carte de la Mauritanie tient
 * largement sur un petit serveur — soit passer par un fournisseur.
 *
 * C'est pourquoi l'échec est un cas **prévu** et non une exception : la
 * fonction renvoie `null`, et l'appelant retombe sur la distance à vol
 * d'oiseau, qui reste utile.
 */

const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving';

export interface Route {
  /** Suite de points [latitude, longitude], prête pour Leaflet. */
  coordinates: [number, number][];
  distanceMeters: number;
  durationSeconds: number;
}

interface OsrmResponse {
  code: string;
  routes?: {
    distance: number;
    duration: number;
    geometry: { coordinates: [number, number][] };
  }[];
}

export async function fetchRoute(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
): Promise<Route | null> {
  /*
   * OSRM attend les coordonnées en longitude,latitude — l'ordre de GeoJSON,
   * inverse de celui que manipulent la plupart des interfaces de cartographie.
   * Les intervertir ne produit pas d'erreur : le service répond simplement
   * qu'aucune route n'existe, quelque part au large.
   */
  const url =
    `${OSRM_BASE}/${from.longitude},${from.latitude};${to.longitude},${to.latitude}` +
    '?overview=full&geometries=geojson';

  try {
    const controller = new AbortController();
    // Un itinéraire est un confort : si le service tarde, mieux vaut afficher
    // la distance directe que bloquer la fiche sur un indicateur d'attente.
    const timeout = setTimeout(() => controller.abort(), 8_000);

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) return null;

    const payload = (await response.json()) as OsrmResponse;
    const route = payload.routes?.[0];

    if (payload.code !== 'Ok' || !route) return null;

    return {
      // Conversion vers l'ordre latitude,longitude attendu par Leaflet.
      coordinates: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
      distanceMeters: Math.round(route.distance),
      durationSeconds: Math.round(route.duration),
    };
  } catch {
    return null;
  }
}

/** « 12 min », « 1 h 25 ». Au-delà de l'heure, les minutes seules se lisent mal. */
export function formatDuration(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${String(rest).padStart(2, '0')}`;
}
