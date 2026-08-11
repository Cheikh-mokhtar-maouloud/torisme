import type { PipelineStage } from 'mongoose';

import { ContentStatus, ExcursionStatus, PlaceType } from '@tourism/shared/constants';
import type { MapMarker, MapResponse } from '@tourism/shared/types';
import type { MapQuery } from '@tourism/shared/validation';

import { Attraction, Excursion, Hotel, Restaurant } from '@/models';

/**
 * Agrégation des lieux géolocalisés pour la carte.
 *
 * Chaque type vit dans sa propre collection : on lance une agrégation par
 * collection, en parallèle. Les enchaîner multiplierait la latence par quatre
 * alors qu'elles sont indépendantes.
 */

interface CollectionSpec {
  type: PlaceType;
  model: typeof Hotel | typeof Restaurant | typeof Attraction | typeof Excursion;
  /** Les excursions géolocalisent leur point de départ, pas le lieu lui-même. */
  locationField: string;
  nameField: string;
  cityField: string;
  priceField?: string;
  /** Filtre propre au type, au-delà de la publication. */
  baseMatch: Record<string, unknown>;
}

function collectionSpecs(): CollectionSpec[] {
  return [
    {
      type: PlaceType.HOTEL,
      model: Hotel,
      locationField: 'location',
      nameField: 'name',
      cityField: 'address.city',
      priceField: 'minPricePerNight',
      baseMatch: { status: ContentStatus.PUBLISHED },
    },
    {
      type: PlaceType.RESTAURANT,
      model: Restaurant,
      locationField: 'location',
      nameField: 'name',
      cityField: 'address.city',
      baseMatch: { status: ContentStatus.PUBLISHED },
    },
    {
      type: PlaceType.ATTRACTION,
      model: Attraction,
      locationField: 'location',
      nameField: 'name',
      cityField: 'address.city',
      priceField: 'entryFee',
      baseMatch: { status: ContentStatus.PUBLISHED },
    },
    {
      type: PlaceType.EXCURSION,
      model: Excursion,
      locationField: 'departureLocation',
      nameField: 'title',
      cityField: 'destination',
      priceField: 'price',
      baseMatch: {
        // Une excursion passée ou annulée n'a rien à faire sur la carte.
        status: { $in: [ExcursionStatus.SCHEDULED, ExcursionStatus.FULL] },
        startsAt: { $gte: new Date() },
      },
    },
  ];
}

export async function getMapMarkers(query: MapQuery): Promise<MapResponse> {
  const requestedTypes = query.types?.length ? new Set(query.types) : undefined;
  const specs = collectionSpecs().filter(
    (spec) => !requestedTypes || requestedTypes.has(spec.type),
  );

  const results = await Promise.all(specs.map((spec) => queryCollection(spec, query)));

  const markers = results.flat();

  // En mode « autour de moi », chaque collection est déjà triée par distance,
  // mais leur fusion ne l'est plus : on retrie sur l'ensemble.
  if (query.latitude !== undefined) {
    markers.sort((a, b) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0));
  }

  const countsByType: Record<string, number> = {};
  for (const marker of markers) {
    countsByType[marker.type] = (countsByType[marker.type] ?? 0) + 1;
  }

  return {
    markers,
    countsByType,
    // Un type ayant atteint exactement le plafond a probablement été tronqué.
    truncated: results.some((group) => group.length === query.limit),
  };
}

async function queryCollection(spec: CollectionSpec, query: MapQuery): Promise<MapMarker[]> {
  const pipeline: PipelineStage[] = [];
  const hasBounds = query.swLat !== undefined && query.neLat !== undefined;
  const hasCenter = query.latitude !== undefined && query.longitude !== undefined;

  if (hasCenter && !hasBounds) {
    /*
     * `$geoNear` doit être la **première** étape du pipeline — MongoDB refuse
     * l'agrégation autrement. C'est aussi le seul opérateur qui expose la
     * distance calculée, indispensable pour trier un « autour de moi ».
     *
     * Les filtres propres au type passent par sa clause `query`, et non par un
     * `$match` ultérieur : filtrer après coup ferait porter la limite de
     * distance sur des documents ensuite écartés.
     */
    pipeline.push({
      $geoNear: {
        near: { type: 'Point', coordinates: [query.longitude!, query.latitude!] },
        distanceField: 'distanceMeters',
        maxDistance: query.radiusMeters,
        spherical: true,
        key: spec.locationField,
        query: spec.baseMatch,
      },
    });
  } else {
    const match: Record<string, unknown> = { ...spec.baseMatch };

    if (hasBounds) {
      // `$box` attend les coins en [longitude, latitude], sud-ouest puis
      // nord-est. C'est exactement ce qu'expose une carte comme cadre visible.
      match[spec.locationField] = {
        $geoWithin: {
          $box: [
            [query.swLng!, query.swLat!],
            [query.neLng!, query.neLat!],
          ],
        },
      };
    }

    pipeline.push({ $match: match });
  }

  pipeline.push(
    { $limit: query.limit },
    {
      // Projection resserrée : une carte n'affiche qu'un nom, une note et une
      // vignette. Rapatrier les descriptions et toutes les images alourdirait
      // la réponse d'un ordre de grandeur pour rien.
      $project: {
        _id: 1,
        name: `$${spec.nameField}`,
        city: `$${spec.cityField}`,
        location: `$${spec.locationField}`,
        rating: { $ifNull: ['$rating', 0] },
        reviewCount: { $ifNull: ['$reviewCount', 0] },
        currency: 1,
        distanceMeters: 1,
        ...(spec.priceField ? { price: `$${spec.priceField}` } : {}),
        firstImage: { $arrayElemAt: ['$images.url', 0] },
      },
    },
  );

  const documents = await spec.model.aggregate<RawMarker>(pipeline);

  return documents
    .filter((document) => Array.isArray(document.location?.coordinates))
    .map((document) => toMarker(document, spec.type));
}

interface RawMarker {
  _id: unknown;
  name: string;
  city?: string;
  location?: { coordinates?: [number, number] };
  rating?: number;
  reviewCount?: number;
  price?: number | null;
  currency?: string;
  distanceMeters?: number;
  firstImage?: string;
}

function toMarker(document: RawMarker, type: PlaceType): MapMarker {
  // Rappel : MongoDB stocke [longitude, latitude] ; les cartes attendent des
  // champs nommés. La conversion est faite ici, une seule fois.
  const [longitude, latitude] = document.location!.coordinates!;

  return {
    id: String(document._id),
    type,
    name: document.name,
    city: document.city ?? '',
    latitude,
    longitude,
    rating: document.rating ?? 0,
    reviewCount: document.reviewCount ?? 0,
    ...(document.firstImage ? { imageUrl: document.firstImage } : {}),
    ...(typeof document.price === 'number' && document.price > 0 ? { price: document.price } : {}),
    ...(document.currency ? { currency: document.currency as MapMarker['currency'] } : {}),
    ...(typeof document.distanceMeters === 'number'
      ? { distanceMeters: Math.round(document.distanceMeters) }
      : {}),
  };
}
