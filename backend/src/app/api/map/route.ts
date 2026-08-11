import { mapQuerySchema } from '@tourism/shared/validation';

import { ok } from '@/lib/api-response';
import { parseQuery, withRoute } from '@/lib/handler';
import { getMapMarkers } from '@/services/map.service';

/**
 * GET /api/map
 *
 * Marqueurs géolocalisés, tous types confondus. Route publique : la carte est
 * consultable sans compte.
 *
 * Exemples :
 *   /api/map?swLat=17.9&swLng=-16.1&neLat=18.2&neLng=-15.8
 *   /api/map?latitude=18.07&longitude=-15.95&radiusMeters=20000
 *   /api/map?types=HOTEL,RESTAURANT
 */
export const GET = withRoute(async (request) => {
  const query = parseQuery(request, mapQuerySchema);
  return ok(await getMapMarkers(query));
});
