import type { NavigatorScreenParams } from '@react-navigation/native';

import type { PlaceType } from '@tourism/shared/constants';

/**
 * Types de navigation.
 *
 * Déclarés une seule fois puis injectés dans l'espace de noms de React
 * Navigation : `navigation.navigate('HotelDetail')` sans paramètre, ou avec un
 * paramètre mal nommé, devient une erreur de compilation plutôt qu'un écran
 * vide au moment du test.
 */

export type TabParamList = {
  Home: undefined;
  Explore: { initialType?: PlaceTab } | undefined;
  Map: undefined;
  Bookings: undefined;
  Profile: undefined;
};

export type PlaceTab = 'hotels' | 'restaurants' | 'attractions' | 'excursions';

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList>;
  HotelDetail: { hotelId: string; hotelName?: string };
  RoomDetail: { roomId: string; roomName?: string };
  BookingFlow: { roomId: string };
  BookingConfirmation: { bookingId: string };
  BookingDetail: { bookingId: string };
  RestaurantDetail: { restaurantId: string; name?: string };
  AttractionDetail: { attractionId: string; name?: string };
  ExcursionDetail: { excursionId: string; title?: string };
  ExcursionBooking: { excursionId: string };
  ExcursionBookingConfirmation: { bookingId: string };
  ExcursionBookingDetail: { bookingId: string };
  Favorites: undefined;
  Notifications: undefined;
  WriteReview: { targetType: PlaceType; targetId: string; targetName: string };
  EditProfile: undefined;
  ChangePassword: undefined;
  Login: { message?: string } | undefined;
  Register: undefined;
  /**
   * Vérification de l'adresse après inscription.
   *
   * L'adresse voyage en paramètre : la redemander juste après l'avoir saisie
   * serait une occasion de faute de frappe, et le code ne correspondrait alors
   * à rien sans que l'utilisateur comprenne pourquoi.
   */
  VerifyEmail: { email: string };
};

declare global {
  // API imposée par React Navigation : l'espace de noms global est le point
  // d'extension prévu pour typer les paramètres de route.
  namespace ReactNavigation {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- fusion de déclaration
    interface RootParamList extends RootStackParamList {}
  }
}
