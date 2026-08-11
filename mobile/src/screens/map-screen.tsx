import { useCallback, useRef, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DEFAULT_MAP_CENTER, PlaceType } from '@tourism/shared/constants';
import type { MapMarker } from '@tourism/shared/types';

import { useMapMarkers, type MapBounds } from '../api/use-map';
import { MapMarkerCard, MARKER_COLORS, TYPE_LABELS } from '../components/map-marker-card';
import { ErrorState } from '../components/ui';
import { useDebouncedValue } from '../lib/use-debounced-value';
import { colors, radius, spacing, typography } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Navigation = NativeStackNavigationProp<RootStackParamList>;

const ALL_TYPES = Object.values(PlaceType);

const INITIAL_REGION: Region = {
  latitude: DEFAULT_MAP_CENTER.latitude,
  longitude: DEFAULT_MAP_CENTER.longitude,
  latitudeDelta: DEFAULT_MAP_CENTER.latitudeDelta,
  longitudeDelta: DEFAULT_MAP_CENTER.longitudeDelta,
};

/**
 * Carte interactive.
 *
 * Les marqueurs sont chargés pour le **cadre visible**, pas pour tout le pays :
 * une carte touristique nationale finirait par contenir des milliers de points,
 * dont l'écrasante majorité hors écran.
 */
export function MapScreen() {
  const navigation = useNavigation<Navigation>();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);

  const [bounds, setBounds] = useState<MapBounds | null>(null);
  const [activeTypes, setActiveTypes] = useState<PlaceType[]>(ALL_TYPES);
  const [selected, setSelected] = useState<MapMarker | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [locationNotice, setLocationNotice] = useState<string>();

  // Le déplacement de la carte émet en continu : sans temporisation, un seul
  // geste déclencherait des dizaines de requêtes.
  const debouncedBounds = useDebouncedValue(bounds, 350);
  const { data, error, isFetching, refetch } = useMapMarkers(debouncedBounds, activeTypes);

  const handleRegionChange = useCallback((region: Region) => {
    setBounds({
      swLat: region.latitude - region.latitudeDelta / 2,
      swLng: region.longitude - region.longitudeDelta / 2,
      neLat: region.latitude + region.latitudeDelta / 2,
      neLng: region.longitude + region.longitudeDelta / 2,
    });
  }, []);

  const toggleType = (type: PlaceType) => {
    setSelected(null);
    setActiveTypes((current) => {
      const next = current.includes(type)
        ? current.filter((item) => item !== type)
        : [...current, type];
      // Tout décocher afficherait une carte vide sans que l'utilisateur
      // comprenne pourquoi : on revient alors à « tous les types ».
      return next.length === 0 ? ALL_TYPES : next;
    });
  };

  /**
   * Recentrage sur la position de l'utilisateur.
   *
   * Le refus d'autorisation est un cas normal, pas une erreur : la carte reste
   * utilisable sur le centre par défaut et on l'explique en une phrase.
   */
  const centerOnUser = async () => {
    setLocationNotice(undefined);
    setIsLocating(true);

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status !== 'granted') {
        setLocationNotice('Autorisation refusée. La carte reste centrée sur Nouakchott.');
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      mapRef.current?.animateToRegion(
        {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          latitudeDelta: 0.08,
          longitudeDelta: 0.08,
        },
        500,
      );
    } catch {
      setLocationNotice('Position indisponible. Vérifiez que la localisation est activée.');
    } finally {
      setIsLocating(false);
    }
  };

  const markers = data?.markers ?? [];

  return (
    <View style={styles.screen}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        // Google Maps sur Android ; iOS conserve Apple Maps, qui ne demande
        // aucune clé et s'intègre mieux au système.
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        initialRegion={INITIAL_REGION}
        onRegionChangeComplete={handleRegionChange}
        showsUserLocation
        showsMyLocationButton={false}
        toolbarEnabled={false}
        // Fermer la fiche en touchant la carte est le geste attendu.
        onPress={() => setSelected(null)}
      >
        {markers.map((marker) => (
          <Marker
            key={`${marker.type}-${marker.id}`}
            coordinate={{ latitude: marker.latitude, longitude: marker.longitude }}
            pinColor={MARKER_COLORS[marker.type]}
            title={marker.name}
            description={marker.city}
            // `onPress` du marqueur : la sélection alimente la mini-fiche, et
            // `stopPropagation` empêche le `onPress` de la carte de la refermer
            // aussitôt.
            onPress={(event) => {
              event.stopPropagation();
              setSelected(marker);
            }}
          />
        ))}
      </MapView>

      <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filters}
        >
          {ALL_TYPES.map((type) => {
            const isActive = activeTypes.includes(type);
            const count = data?.countsByType[type] ?? 0;

            return (
              <Pressable
                key={type}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
                accessibilityLabel={`${TYPE_LABELS[type]}, ${count} sur la carte`}
                onPress={() => toggleType(type)}
                style={({ pressed }) => [
                  styles.filter,
                  isActive && {
                    backgroundColor: MARKER_COLORS[type],
                    borderColor: MARKER_COLORS[type],
                  },
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.filterLabel, isActive && styles.filterLabelActive]}>
                  {TYPE_LABELS[type]}
                  {isActive && count > 0 ? ` ${count}` : ''}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {isFetching ? (
        <View style={[styles.status, { top: insets.top + 64 }]}>
          <ActivityIndicator size="small" color={colors.brand[700]} />
          <Text style={styles.statusText}>Chargement…</Text>
        </View>
      ) : data?.truncated ? (
        <View style={[styles.status, { top: insets.top + 64 }]}>
          <Text style={styles.statusText}>Beaucoup de lieux ici — zoomez pour affiner</Text>
        </View>
      ) : markers.length === 0 && bounds ? (
        <View style={[styles.status, { top: insets.top + 64 }]}>
          <Text style={styles.statusText}>Aucun lieu dans cette zone</Text>
        </View>
      ) : null}

      {locationNotice ? (
        <View style={[styles.notice, { top: insets.top + 64 }]}>
          <Text style={styles.noticeText}>{locationNotice}</Text>
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Centrer sur ma position"
        onPress={() => void centerOnUser()}
        disabled={isLocating}
        style={({ pressed }) => [
          styles.locateButton,
          { bottom: selected ? 170 : insets.bottom + spacing.lg },
          pressed && styles.pressed,
        ]}
      >
        {isLocating ? (
          <ActivityIndicator size="small" color={colors.brand[700]} />
        ) : (
          <Text style={styles.locateIcon}>◎</Text>
        )}
      </Pressable>

      {error ? (
        <View style={styles.errorOverlay}>
          <ErrorState
            message={error instanceof Error ? error.message : 'Carte indisponible.'}
            onRetry={() => void refetch()}
          />
        </View>
      ) : null}

      {selected ? (
        <MapMarkerCard
          marker={selected}
          onClose={() => setSelected(null)}
          onPress={() => openDetail(navigation, selected)}
        />
      ) : null}
    </View>
  );
}

/** Chaque type de marqueur mène à sa propre fiche. */
function openDetail(navigation: Navigation, marker: MapMarker): void {
  if (marker.type === PlaceType.HOTEL) {
    navigation.navigate('HotelDetail', { hotelId: marker.id, hotelName: marker.name });
    return;
  }
  if (marker.type === PlaceType.RESTAURANT) {
    navigation.navigate('RestaurantDetail', { restaurantId: marker.id, name: marker.name });
    return;
  }
  if (marker.type === PlaceType.ATTRACTION) {
    navigation.navigate('AttractionDetail', { attractionId: marker.id, name: marker.name });
    return;
  }
  navigation.navigate('ExcursionDetail', { excursionId: marker.id, title: marker.name });
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.subtle },
  pressed: { opacity: 0.85 },

  topBar: { position: 'absolute', left: 0, right: 0, top: 0 },
  filters: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.sm },
  filter: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.surface.background,
    borderWidth: 1,
    borderColor: colors.surface.border,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  filterLabel: { ...typography.caption, color: colors.text.secondary, fontWeight: '600' },
  filterLabelActive: { color: colors.text.inverse },

  status: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface.background,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  statusText: { ...typography.caption, color: colors.text.secondary },

  notice: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    backgroundColor: colors.sand[50],
    borderRadius: radius.md,
    padding: spacing.md,
  },
  noticeText: { ...typography.caption, color: colors.text.secondary, textAlign: 'center' },

  locateButton: {
    position: 'absolute',
    right: spacing.lg,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surface.background,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  locateIcon: { fontSize: 22, color: colors.brand[700] },

  errorOverlay: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    top: '35%',
    backgroundColor: colors.surface.background,
    borderRadius: radius.lg,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
});
