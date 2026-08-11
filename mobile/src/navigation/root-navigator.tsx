import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StyleSheet, Text } from 'react-native';

import { colors, typography } from '../theme';
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
import { ExcursionBookingScreen } from '../screens/excursion-booking-screen';
import {
  ExcursionBookingConfirmationScreen,
  ExcursionBookingDetailScreen,
} from '../screens/excursion-booking-detail-screen';
import type { RootStackParamList, TabParamList } from './types';

const Tab = createBottomTabNavigator<TabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * Icônes en emoji.
 *
 * Aucune police d'icônes ni bibliothèque supplémentaire : les emoji sont rendus
 * nativement sur les deux plateformes. Un jeu d'icônes vectorielles cohérent
 * viendra avec l'identité graphique définitive.
 */
const TAB_ICONS: Record<keyof TabParamList, string> = {
  Home: '🏠',
  Explore: '🔍',
  Map: '🗺️',
  Bookings: '🎫',
  Profile: '👤',
};

const TAB_LABELS: Record<keyof TabParamList, string> = {
  Home: 'Accueil',
  Explore: 'Explorer',
  Map: 'Carte',
  Bookings: 'Réservations',
  Profile: 'Profil',
};

function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        // Les écrans gèrent eux-mêmes leur zone sûre haute : un en-tête
        // supplémentaire volerait de la hauteur sur des listes déjà denses.
        headerShown: false,
        tabBarActiveTintColor: colors.brand[700],
        tabBarInactiveTintColor: colors.text.muted,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabLabel,
        tabBarLabel: TAB_LABELS[route.name],
        tabBarIcon: ({ focused }) => (
          <Text style={[styles.tabIcon, !focused && styles.tabIconInactive]}>
            {TAB_ICONS[route.name]}
          </Text>
        ),
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
        options={({ route }) => ({ title: route.params.hotelName ?? 'Hôtel' })}
      />
      <Stack.Screen
        name="RoomDetail"
        component={RoomDetailScreen}
        options={({ route }) => ({ title: route.params.roomName ?? 'Chambre' })}
      />
      <Stack.Screen
        name="BookingFlow"
        component={BookingFlowScreen}
        options={{ title: 'Votre séjour' }}
      />
      <Stack.Screen
        name="BookingConfirmation"
        component={BookingConfirmationScreen}
        options={{
          title: 'Réservation',
          // Pas de retour vers le formulaire : la réservation est créée, y
          // revenir n'aurait aucun sens et risquerait un doublon.
          headerBackVisible: false,
          gestureEnabled: false,
        }}
      />
      <Stack.Screen
        name="BookingDetail"
        component={BookingDetailScreen}
        options={{ title: 'Réservation' }}
      />

      <Stack.Screen
        name="RestaurantDetail"
        component={RestaurantDetailScreen}
        options={({ route }) => ({ title: route.params.name ?? 'Restaurant' })}
      />
      <Stack.Screen
        name="AttractionDetail"
        component={AttractionDetailScreen}
        options={({ route }) => ({ title: route.params.name ?? 'Attraction' })}
      />
      <Stack.Screen
        name="ExcursionDetail"
        component={ExcursionDetailScreen}
        options={({ route }) => ({ title: route.params.title ?? 'Excursion' })}
      />

      <Stack.Screen
        name="ExcursionBooking"
        component={ExcursionBookingScreen}
        options={{ title: 'Réserver' }}
      />
      <Stack.Screen
        name="ExcursionBookingConfirmation"
        component={ExcursionBookingConfirmationScreen}
        options={{
          title: 'Réservation',
          // Revenir au formulaire après une réservation créée risquerait un doublon.
          headerBackVisible: false,
          gestureEnabled: false,
        }}
      />
      <Stack.Screen
        name="ExcursionBookingDetail"
        component={ExcursionBookingDetailScreen}
        options={{ title: 'Réservation' }}
      />

      <Stack.Screen
        name="EditProfile"
        component={EditProfileScreen}
        options={{ title: 'Profil' }}
      />
      <Stack.Screen
        name="ChangePassword"
        component={ChangePasswordScreen}
        options={{ title: 'Mot de passe' }}
      />

      <Stack.Group screenOptions={{ presentation: 'modal' }}>
        <Stack.Screen name="Login" component={LoginScreen} options={{ title: 'Connexion' }} />
        <Stack.Screen
          name="Register"
          component={RegisterScreen}
          options={{ title: 'Créer un compte' }}
        />
      </Stack.Group>
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.surface.background,
    borderTopColor: colors.surface.border,
    height: 60,
    paddingTop: 6,
  },
  tabLabel: { ...typography.caption, fontSize: 11, fontWeight: '500' },
  tabIcon: { fontSize: 20 },
  tabIconInactive: { opacity: 0.5 },

  header: { backgroundColor: colors.surface.background },
  headerTitle: { ...typography.h3, color: colors.text.primary },
});
