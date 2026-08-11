import { ContentStatus } from '@tourism/shared/constants';
import type { Hotel as HotelDto } from '@tourism/shared/types';
import type {
  CreateHotelInput,
  HotelListQuery,
  UpdateHotelInput,
} from '@tourism/shared/validation';

import { HttpError } from '@/lib/errors';
import { buildPlaceFilter, buildSort, paginateQuery, type PaginatedResult } from '@/lib/query';
import { serializeDocument } from '@/lib/serialize';
import { Hotel, Room } from '@/models';

const SORTABLE_FIELDS = ['rating', 'minPricePerNight', 'stars', 'createdAt', 'name'] as const;

export async function listHotels(
  query: HotelListQuery,
  isAdmin: boolean,
): Promise<PaginatedResult<HotelDto>> {
  const filter = buildPlaceFilter(query, isAdmin);

  if (query.minStars !== undefined) filter.stars = { $gte: query.minStars };
  if (query.maxPrice !== undefined) filter.minPricePerNight = { $lte: query.maxPrice };
  if (query.amenities?.length) filter.amenities = { $all: query.amenities };

  const sort = buildSort(query.sortBy, query.sortOrder, SORTABLE_FIELDS, {
    rating: -1,
    createdAt: -1,
  });

  return paginateQuery(Hotel, filter, { page: query.page, limit: query.limit, sort }, (doc) =>
    serializeDocument<HotelDto>(doc),
  );
}

export async function getHotelById(id: string, isAdmin: boolean): Promise<HotelDto> {
  const hotel = await Hotel.findById(id).lean();
  if (!hotel) throw HttpError.notFound('Hôtel introuvable');

  // Une fiche non publiée ne doit pas être atteignable en devinant son identifiant.
  if (!isAdmin && hotel.status !== ContentStatus.PUBLISHED) {
    throw HttpError.notFound('Hôtel introuvable');
  }

  return serializeDocument<HotelDto>(hotel);
}

export async function createHotel(input: CreateHotelInput): Promise<HotelDto> {
  const created = await Hotel.create(input);
  return serializeDocument<HotelDto>(created.toObject());
}

export async function updateHotel(id: string, input: UpdateHotelInput): Promise<HotelDto> {
  // `$set` construit à partir d'un objet déjà validé par Zod : les champs dérivés
  // (rating, reviewCount, minPricePerNight) ne figurent pas dans le schéma
  // d'entrée et ne peuvent donc pas être écrasés depuis un client.
  const updated = await Hotel.findByIdAndUpdate(
    id,
    { $set: input },
    { new: true, runValidators: true },
  ).lean();

  if (!updated) throw HttpError.notFound('Hôtel introuvable');
  return serializeDocument<HotelDto>(updated);
}

/**
 * Supprime un hôtel et ses chambres.
 *
 * La suppression est refusée s'il reste des chambres publiées : effacer un
 * hôtel encore proposé à la réservation est presque toujours une erreur de
 * manipulation. L'administrateur doit d'abord dépublier.
 */
export async function deleteHotel(id: string): Promise<void> {
  const publishedRooms = await Room.countDocuments({
    hotelId: id,
    status: ContentStatus.PUBLISHED,
  });

  if (publishedRooms > 0) {
    throw HttpError.conflict(
      `Cet hôtel a ${publishedRooms} chambre(s) publiée(s). Dépubliez-les avant de le supprimer.`,
    );
  }

  const deleted = await Hotel.findByIdAndDelete(id).lean();
  if (!deleted) throw HttpError.notFound('Hôtel introuvable');

  await Room.deleteMany({ hotelId: id });
}

/**
 * Recalcule le prix minimum affiché sur la fiche hôtel.
 *
 * Appelé après toute écriture sur une chambre. Le champ est dénormalisé pour
 * éviter une agrégation à chaque affichage de liste ; il doit donc être remis à
 * jour ici, jamais par le client.
 */
export async function refreshHotelMinPrice(hotelId: string): Promise<void> {
  const [cheapest] = await Room.find({ hotelId, status: ContentStatus.PUBLISHED })
    .sort({ pricePerNight: 1 })
    .limit(1)
    .select('pricePerNight')
    .lean();

  await Hotel.findByIdAndUpdate(hotelId, {
    $set: { minPricePerNight: cheapest?.pricePerNight ?? null },
  });
}
