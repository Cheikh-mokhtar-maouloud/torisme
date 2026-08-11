import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  Attraction,
  Booking,
  Excursion,
  Hotel,
  Paginated,
  Restaurant,
  Room,
} from '@tourism/shared/types';
import type { CreateBookingInput } from '@tourism/shared/validation';

import { api, toQuery } from './client';

/**
 * Accès aux données de l'API.
 *
 * Les clés de cache sont centralisées ici : après une réservation, il faut
 * invalider la liste des réservations **et** la disponibilité de la chambre.
 * Éparpiller ces chaînes dans les écrans garantit d'en oublier une et
 * d'afficher des données périmées.
 */
export const queryKeys = {
  hotels: (params: HotelListParams) => ['hotels', params] as const,
  hotel: (id: string) => ['hotel', id] as const,
  hotelRooms: (id: string) => ['hotel', id, 'rooms'] as const,
  room: (id: string) => ['room', id] as const,
  availability: (roomId: string, checkIn: string, checkOut: string) =>
    ['availability', roomId, checkIn, checkOut] as const,
  restaurants: (search?: string) => ['restaurants', search ?? ''] as const,
  attractions: (search?: string) => ['attractions', search ?? ''] as const,
  excursions: (search?: string) => ['excursions', search ?? ''] as const,
  bookings: () => ['bookings'] as const,
  booking: (id: string) => ['booking', id] as const,
};

export interface HotelListParams {
  search?: string | undefined;
  city?: string | undefined;
  minStars?: number | undefined;
  maxPrice?: number | undefined;
}

export function useHotels(params: HotelListParams) {
  return useQuery({
    queryKey: queryKeys.hotels(params),
    queryFn: ({ signal }) =>
      api.list<Hotel>(
        `/api/hotels${toQuery({ limit: 20, sortBy: 'rating', sortOrder: 'desc', ...params })}`,
        signal,
      ),
  });
}

export function useHotel(hotelId: string) {
  return useQuery({
    queryKey: queryKeys.hotel(hotelId),
    queryFn: ({ signal }) => api.get<Hotel>(`/api/hotels/${hotelId}`, signal),
  });
}

export function useHotelRooms(hotelId: string) {
  return useQuery({
    queryKey: queryKeys.hotelRooms(hotelId),
    queryFn: ({ signal }) => api.list<Room>(`/api/hotels/${hotelId}/rooms`, signal),
  });
}

export function useRoom(roomId: string) {
  return useQuery({
    queryKey: queryKeys.room(roomId),
    queryFn: ({ signal }) => api.get<Room>(`/api/rooms/${roomId}`, signal),
  });
}

export interface Availability {
  roomId: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  totalUnits: number;
  bookedUnits: number;
  availableUnits: number;
  isAvailable: boolean;
  unitPrice: number;
  totalPrice: number;
  currency: string;
}

/**
 * Disponibilité et prix total pour une période.
 *
 * Le montant vient du serveur et n'est jamais recalculé ici : un total affiché
 * localement puis contredit à la confirmation détruit la confiance, et un prix
 * calculé côté client serait modifiable.
 */
export function useAvailability(roomId: string, checkIn: string, checkOut: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.availability(roomId, checkIn, checkOut),
    queryFn: ({ signal }) =>
      api.get<Availability>(
        `/api/rooms/${roomId}/availability${toQuery({ checkIn, checkOut })}`,
        signal,
      ),
    enabled: enabled && Boolean(roomId && checkIn && checkOut),
    // La disponibilité change sous l'effet des autres utilisateurs : elle est
    // considérée périmée immédiatement, contrairement aux fiches de contenu.
    staleTime: 0,
  });
}

export function useRestaurants(search?: string) {
  return useQuery({
    queryKey: queryKeys.restaurants(search),
    queryFn: ({ signal }) =>
      api.list<Restaurant>(`/api/restaurants${toQuery({ limit: 20, search })}`, signal),
  });
}

export function useAttractions(search?: string) {
  return useQuery({
    queryKey: queryKeys.attractions(search),
    queryFn: ({ signal }) =>
      api.list<Attraction>(`/api/attractions${toQuery({ limit: 20, search })}`, signal),
  });
}

export function useExcursions(search?: string) {
  return useQuery({
    queryKey: queryKeys.excursions(search),
    queryFn: ({ signal }) =>
      api.list<Excursion>(`/api/excursions${toQuery({ limit: 20, search })}`, signal),
  });
}

export function useBookings(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.bookings(),
    queryFn: ({ signal }) => api.list<Booking>('/api/bookings?limit=50', signal),
    enabled,
  });
}

export function useBooking(bookingId: string) {
  return useQuery({
    queryKey: queryKeys.booking(bookingId),
    queryFn: ({ signal }) => api.get<Booking>(`/api/bookings/${bookingId}`, signal),
  });
}

export function useCreateBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateBookingInput) => api.post<Booking>('/api/bookings', input),
    onSuccess: (booking) => {
      // La liste des réservations et la disponibilité de la chambre viennent de
      // changer : les laisser en cache afficherait un état faux.
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookings() });
      void queryClient.invalidateQueries({ queryKey: ['availability', booking.roomId] });
    },
  });
}

export function useCancelBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (bookingId: string) => api.patch<Booking>(`/api/bookings/${bookingId}/cancel`, {}),
    onSuccess: (booking) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookings() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.booking(booking.id) });
      // L'annulation libère une unité : la disponibilité doit être recalculée.
      void queryClient.invalidateQueries({ queryKey: ['availability', booking.roomId] });
    },
  });
}

export type { Paginated };
