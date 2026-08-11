import { ContentStatus } from '@tourism/shared/constants';
import type { Room as RoomDto } from '@tourism/shared/types';
import type { CreateRoomInput, RoomListQuery, UpdateRoomInput } from '@tourism/shared/validation';

import { HttpError } from '@/lib/errors';
import { buildSort, paginateQuery, type PaginatedResult } from '@/lib/query';
import { serializeDocument } from '@/lib/serialize';
import { Hotel, Room } from '@/models';

import { refreshHotelMinPrice } from './hotel.service';

const SORTABLE_FIELDS = ['pricePerNight', 'capacity', 'createdAt', 'name'] as const;

export async function listRooms(
  query: RoomListQuery,
  isAdmin: boolean,
): Promise<PaginatedResult<RoomDto>> {
  const filter: Record<string, unknown> = {};

  if (isAdmin) {
    if (query.status) filter.status = query.status;
  } else {
    filter.status = ContentStatus.PUBLISHED;
  }

  if (query.hotelId) filter.hotelId = query.hotelId;
  if (query.minCapacity !== undefined) filter.capacity = { $gte: query.minCapacity };
  if (query.maxPrice !== undefined) filter.pricePerNight = { $lte: query.maxPrice };

  const sort = buildSort(query.sortBy, query.sortOrder, SORTABLE_FIELDS, { pricePerNight: 1 });

  return paginateQuery(Room, filter, { page: query.page, limit: query.limit, sort }, (doc) =>
    serializeDocument<RoomDto>(doc),
  );
}

export async function getRoomById(id: string, isAdmin: boolean): Promise<RoomDto> {
  const room = await Room.findById(id).lean();
  if (!room) throw HttpError.notFound('Chambre introuvable');

  if (!isAdmin && room.status !== ContentStatus.PUBLISHED) {
    throw HttpError.notFound('Chambre introuvable');
  }

  return serializeDocument<RoomDto>(room);
}

export async function createRoom(input: CreateRoomInput): Promise<RoomDto> {
  // MongoDB n'a pas de clé étrangère : l'existence de l'hôtel est vérifiée ici,
  // sinon une faute de frappe dans `hotelId` créerait une chambre orpheline
  // invisible dans le dashboard et impossible à réserver.
  const hotelExists = await Hotel.exists({ _id: input.hotelId });
  if (!hotelExists) throw HttpError.validation('Hôtel introuvable', { hotelId: ['Hôtel inconnu'] });

  const created = await Room.create(input);
  await refreshHotelMinPrice(input.hotelId);

  return serializeDocument<RoomDto>(created.toObject());
}

export async function updateRoom(id: string, input: UpdateRoomInput): Promise<RoomDto> {
  const updated = await Room.findByIdAndUpdate(
    id,
    { $set: input },
    { new: true, runValidators: true },
  ).lean();

  if (!updated) throw HttpError.notFound('Chambre introuvable');

  // Le prix ou le statut a pu changer : la valeur dénormalisée sur l'hôtel suit.
  await refreshHotelMinPrice(String(updated.hotelId));

  return serializeDocument<RoomDto>(updated);
}

export async function deleteRoom(id: string): Promise<void> {
  const deleted = await Room.findByIdAndDelete(id).lean();
  if (!deleted) throw HttpError.notFound('Chambre introuvable');

  await refreshHotelMinPrice(String(deleted.hotelId));
}

/** Chambres d'un hôtel donné — requête de la page détail. */
export async function listRoomsByHotel(
  hotelId: string,
  isAdmin: boolean,
): Promise<PaginatedResult<RoomDto>> {
  return listRooms(
    { hotelId, page: 1, limit: 100, sortOrder: 'asc', sortBy: 'pricePerNight' } as RoomListQuery,
    isAdmin,
  );
}
