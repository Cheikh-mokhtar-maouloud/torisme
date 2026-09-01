import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';

import { colors, typography } from '../theme';
import { Icon, type IconName } from '../components/icon';
import { ExploreScreen } from '../screens/explore-screen';
import { HomeScreen } from '../screens/home-screen';
import { MapScreen } from '../screens/map-screen';
import { BookingsScreen } from '../screens/bookings-screen';
import { ProfileScreen } from '../screens/profile-screen';
import { HotelDetailScreen } from '../screens/hotel-detail-screen';
import { RoomDetailScreen } from '../screens/room-detail-screen';
import { BookingFlowScreen } from '../screens/booking-flow-screen';
import { BookingConfirmationScreen, BookingDetailScreen } from '../screens/booking-detail-screen';
import {
  AttractionDetailScreen,
  ExcursionDetailScreen,
  RestaurantDetailScreen,
} from '../screens/place-detail-screens';
import { LoginScreen, RegisterScreen } from '../screens/auth-screens';
import { ChangePasswordScreen, EditProfileScreen } from '../screens/account-screens';
import { FavoritesScreen, WriteReviewScreen } from '../screens/social-screens';
import { NotificationsScreen } from '../screens/notifications-screen';
import { ExcursionBookingScreen } from '../screens/excursion-booking-screen';
import {
  ExcursionBookingConfirmationScreen,
  ExcursionBookingDetailScreen,
} from '../screens/excursion-booking-detail-screen';
import type { RootStackParamList, TabParamList } from './types';

const Tab = createBottomTabNavigator<TabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * Icônes de la barre d'onglets.
 *
 * Les emoji employés jusqu'ici ont été remplacés par un jeu vectoriel. Un emoji
 * est rendu par la police du système : son dessin change d'un téléphone à
 * l'autre, il ignore la teinte demandée — donc l'onglet actif ne se distingue
 * plus de l'inactif autrement que par le libellé — et son gabarit ne s'aligne
 * pas sur celui du texte.
 */
const TAB_ICONS: Record<keyof TabParamList, IconName> = {
  Home: 'home',
  Explore: 'search',
  Map: 'map',
  Bookings: 'ticket',
  Profile: 'user',
};

/**
 * Clés de traduction des onglets.
 *
 * Des clés et non des libellés : le navigateur est construit une seule fois, et
 * y figer du texte le laisserait en français après un changement de langue.
 */
const TAB_LABELS: Record<keyof TabParamList, string> = {
  Home: 'tabs.home',
  Explore: 'tabs.explore',
  Map: 'tabs.map',
  Bookings: 'tabs.bookings',
  Profile: 'tabs.profile',
};

function TabNavigator() {
  const { t } = useTranslation();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        // Les écrans gèrent eux-mêmes leur zone sûre haute : un en-tête
        // supplémentaire volerait de la hauteur sur des listes déjà denses.
        headerShown: false,
        // Teal de marque plutôt que noir : l'onglet actif se distingue par la
        // couleur, non par un simple surcroît de contraste que l'œil doit
        // comparer d'un onglet à l'autre.
        tabBarActiveTintColor: colors.brand[600],
        tabBarInactiveTintColor: colors.text.muted,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabLabel,
        tabBarLabel: t(TAB_LABELS[route.name]),
        // La couleur vient de `color`, fourni par le navigateur : l'onglet actif
        // et l'inactif partagent ainsi exactement le même dessin, seule la
        // teinte change. C'est ce que l'emoji ne permettait pas.
        tabBarIcon: ({ color }) => <Icon name={TAB_ICONS[route.name]} size={22} color={color} />,
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Explore" component={ExploreScreen} />
      <Tab.Screen name="Map" component={MapScreen} />
      <Tab.Screen name="Bookings" component={BookingsScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

export function RootNavigator() {
  /*
   * `useTranslation` et non `i18n.t` directement : le hook réabonne le
   * composant aux changements de langue. Avec l'appel direct, les titres
   * resteraient dans la langue en vigueur au moment où le navigateur a été
   * construit.
   */
  const { t } = useTranslation();

  return (
    <Stack.Navigator
      screenOptions={{
        headerTitleStyle: styles.headerTitle,
        headerTintColor: colors.brand[700],
        headerShadowVisible: false,
        headerStyle: styles.header,
        // Retour arrière au geste : attendu sur iOS, apprécié sur Android.
        gestureEnabled: true,
      }}
    >
      <Stack.Screen name="Tabs" component={TabNavigator} options={{ headerShown: false }} />

      <Stack.Screen
        name="HotelDetail"
        component={HotelDetailScreen}
        // Le titre vient du paramètre de route : il s'affiche immédiatement,
        // avant même que la fiche soit chargée.
        options={({ route }) => ({ title: route.params.hotelName ?? t('types.hotel') })}
      />
      <Stack.Screen
        name="RoomDetail"
        component={RoomDetailScreen}
        options={({ route }) => ({ title: route.params.roomName ?? t('types.room') })}
      />
      <Stack.Screen
        name="BookingFlow"
        component={BookingFlowScreen}
        options={{ title: t('screens.stay') }}
      />
      <Stack.Screen
        name="BookingConfirmation"
        component={BookingConfirmationScreen}
        options={{
          title: t('screens.booking'),
          // Pas de retour vers le formulaire : la réservation est créée, y
          // revenir n'aurait aucun sens et risquerait un doublon.
          headerBackVisible: false,
          gestureEnabled: false,
        }}
      />
      <Stack.Screen
        name="BookingDetail"
        component={BookingDetailScreen}
        options={{ title: t('screens.booking') }}
      />

      <Stack.Screen
        name="RestaurantDetail"
        component={RestaurantDetailScreen}
        options={({ route }) => ({ title: route.params.name ?? t('types.restaurant') })}
      />
      <Stack.Screen
        name="AttractionDetail"
        component={AttractionDetailScreen}
        options={({ route }) => ({ title: route.params.name ?? t('types.attraction') })}
      />
      <Stack.Screen
        name="ExcursionDetail"
        component={ExcursionDetailScreen}
        options={({ route }) => ({ title: route.params.title ?? t('types.excursion') })}
      />

      <Stack.Screen
        name="ExcursionBooking"
        component={ExcursionBookingScreen}
        options={{ title: t('screens.book') }}
      />
      <Stack.Screen
        name="ExcursionBookingConfirmation"
        component={ExcursionBookingConfirmationScreen}
        options={{
          title: t('screens.booking'),
          // Revenir au formulaire après une réservation créée risquerait un doublon.
          headerBackVisible: false,
          gestureEnabled: false,
        }}
      />
      <Stack.Screen
        name="ExcursionBookingDetail"
        component={ExcursionBookingDetailScreen}
        options={{ title: t('screens.booking') }}
      />

      <Stack.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{ title: t('screens.notifications') }}
      />
      <Stack.Screen
        name="Favorites"
        component={FavoritesScreen}
        options={{ title: t('screens.favorites') }}
      />
      <Stack.Screen
        name="WriteReview"
        component={WriteReviewScreen}
        options={{ title: t('screens.writeReview') }}
      />

      <Stack.Screen
        name="EditProfile"
        component={EditProfileScreen}
        options={{ title: t('screens.editProfile') }}
      />
      <Stack.Screen
        name="ChangePassword"
        component={ChangePasswordScreen}
        options={{ title: t('screens.changePassword') }}
      />

      <Stack.Group screenOptions={{ presentation: 'modal' }}>
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{ title: t('screens.login') }}
        />
        <Stack.Screen
          name="Register"
          component={RegisterScreen}
          options={{ title: t('screens.register') }}
        />
      </Stack.Group>
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  /*
   * Barre d'onglets sans trait supérieur.
   *
   * Le fond blanc et l'ombre du système suffisent à la détacher du contenu.
   * Une ligne grise en travers de l'écran est exactement le genre de détail qui
   * date une interface, et elle n'ajoute aucune information.
   */
  tabBar: {
    backgroundColor: colors.surface.background,
    borderTopWidth: 0,
    height: 64,
    paddingTop: 8,
    paddingBottom: 8,
  },
  tabLabel: { fontSize: 11, lineHeight: 14, fontWeight: '600', letterSpacing: 0.1 },

  header: { backgroundColor: colors.surface.background },
  headerTitle: { ...typography.h3, color: colors.text.primary },
});
