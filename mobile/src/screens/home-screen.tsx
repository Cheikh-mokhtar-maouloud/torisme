import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SUPPORTED_COUNTRIES } from '@tourism/shared/constants';

import {
  AttractionCard,
  CompactCard,
  CompactCardSkeleton,
  ExcursionCard,
  RestaurantCard,
} from '../components/cards';
import { ErrorState } from '../components/ui';
import { useAttractions, useExcursions, useHotels, useRestaurants } from '../api/queries';
import { colors, radius, spacing, typography } from '../theme';
import { formatMoney } from '../lib/format';
import type { PlaceTab, RootStackParamList } from '../navigation/types';

type Navigation = NativeStackNavigationProp<RootStackParamList>;

/**
 * Accueil.
 *
 * Structure en carrousels horizontaux plutôt qu'en une longue liste : sur un
 * premier écran, l'objectif est de montrer la variété de l'offre, pas
 * d'épuiser une catégorie. L'utilisateur bascule vers Explorer pour parcourir.
 */
export function HomeScreen() {
  const navigation = useNavigation<Navigation>();
  const insets = useSafeAreaInsets();

  const hotels = useHotels({});
  const attractions = useAttractions();
  const restaurants = useRestaurants();
  const excursions = useExcursions();

  const goToExplore = (initialType: PlaceTab) =>
    navigation.navigate('Tabs', { screen: 'Explore', params: { initialType } });

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Text style={styles.eyebrow}>
          {SUPPORTED_COUNTRIES.map((country) => country.name).join(' · ')}
        </Text>
        <Text style={styles.heading}>Où partez-vous ?</Text>
      </View>

      <Pressable
        accessibilityRole="search"
        accessibilityLabel="Rechercher un hôtel, un restaurant ou une attraction"
        onPress={() => goToExplore('hotels')}
        style={({ pressed }) => [styles.searchBar, pressed && styles.pressed]}
      >
        <Text style={styles.searchIcon}>⌕</Text>
        <Text style={styles.searchPlaceholder}>Rechercher une destination…</Text>
      </Pressable>

      <View style={styles.categories}>
        {CATEGORIES.map((category) => (
          <Pressable
            key={category.type}
            accessibilityRole="button"
            onPress={() => goToExplore(category.type)}
            style={({ pressed }) => [styles.category, pressed && styles.pressed]}
          >
            <Text style={styles.categoryIcon}>{category.icon}</Text>
            <Text style={styles.categoryLabel}>{category.label}</Text>
          </Pressable>
        ))}
      </View>

      <Section
        title="Hôtels populaires"
        onSeeAll={() => goToExplore('hotels')}
        isLoading={hotels.isLoading}
        error={hotels.error}
        onRetry={() => void hotels.refetch()}
        isEmpty={hotels.data?.items.length === 0}
      >
        {hotels.data?.items.slice(0, 6).map((hotel) => (
          <CompactCard
            key={hotel.id}
            name={hotel.name}
            city={hotel.address.city}
            images={hotel.images}
            rating={hotel.rating}
            reviewCount={hotel.reviewCount}
            {...(hotel.minPricePerNight
              ? { footer: `dès ${formatMoney(hotel.minPricePerNight, hotel.currency)}` }
              : {})}
            onPress={() =>
              navigation.navigate('HotelDetail', { hotelId: hotel.id, hotelName: hotel.name })
            }
          />
        ))}
      </Section>

      <Section
        title="Attractions à découvrir"
        onSeeAll={() => goToExplore('attractions')}
        isLoading={attractions.isLoading}
        error={attractions.error}
        onRetry={() => void attractions.refetch()}
        isEmpty={attractions.data?.items.length === 0}
      >
        {attractions.data?.items.slice(0, 6).map((attraction) => (
          <AttractionCard
            key={attraction.id}
            attraction={attraction}
            onPress={() =>
              navigation.navigate('AttractionDetail', {
                attractionId: attraction.id,
                name: attraction.name,
              })
            }
          />
        ))}
      </Section>

      <Section
        title="Excursions programmées"
        onSeeAll={() => goToExplore('excursions')}
        isLoading={excursions.isLoading}
        error={excursions.error}
        onRetry={() => void excursions.refetch()}
        isEmpty={excursions.data?.items.length === 0}
      >
        {excursions.data?.items.slice(0, 6).map((excursion) => (
          <ExcursionCard
            key={excursion.id}
            excursion={excursion}
            onPress={() =>
              navigation.navigate('ExcursionDetail', {
                excursionId: excursion.id,
                title: excursion.title,
              })
            }
          />
        ))}
      </Section>

      <Section
        title="Où manger"
        onSeeAll={() => goToExplore('restaurants')}
        isLoading={restaurants.isLoading}
        error={restaurants.error}
        onRetry={() => void restaurants.refetch()}
        isEmpty={restaurants.data?.items.length === 0}
      >
        {restaurants.data?.items.slice(0, 6).map((restaurant) => (
          <RestaurantCard
            key={restaurant.id}
            restaurant={restaurant}
            onPress={() =>
              navigation.navigate('RestaurantDetail', {
                restaurantId: restaurant.id,
                name: restaurant.name,
              })
            }
          />
        ))}
      </Section>

      <View style={{ height: insets.bottom + spacing.xl }} />
    </ScrollView>
  );
}

const CATEGORIES: { type: PlaceTab; label: string; icon: string }[] = [
  { type: 'hotels', label: 'Hôtels', icon: '🏨' },
  { type: 'attractions', label: 'Sites', icon: '🏛️' },
  { type: 'excursions', label: 'Excursions', icon: '🐫' },
  { type: 'restaurants', label: 'Restaurants', icon: '🍽️' },
];

/**
 * Section à défilement horizontal.
 *
 * Chaque section gère ses trois états — chargement, erreur, vide — de façon
 * indépendante : l'échec d'un carrousel ne doit pas vider tout l'accueil.
 */
function Section({
  title,
  onSeeAll,
  isLoading,
  error,
  onRetry,
  isEmpty,
  children,
}: {
  title: string;
  onSeeAll: () => void;
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
  isEmpty: boolean | undefined;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Pressable accessibilityRole="button" onPress={onSeeAll} hitSlop={8}>
          <Text style={styles.sectionLink}>Tout voir</Text>
        </Pressable>
      </View>

      {error ? (
        <ErrorState
          message={error instanceof Error ? error.message : 'Chargement impossible.'}
          onRetry={onRetry}
        />
      ) : isEmpty ? (
        <Text style={styles.sectionEmpty}>Rien à afficher pour le moment.</Text>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.carousel}
        >
          {isLoading ? [0, 1, 2].map((index) => <CompactCardSkeleton key={index} />) : children}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.subtle },
  content: { paddingBottom: spacing.xl },
  pressed: { opacity: 0.8 },

  header: { paddingHorizontal: spacing.lg, marginBottom: spacing.lg },
  eyebrow: {
    ...typography.caption,
    color: colors.brand[700],
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  heading: { ...typography.h1, color: colors.text.primary, marginTop: spacing.xs },

  searchBar: {
    marginHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface.background,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.surface.border,
    paddingHorizontal: spacing.lg,
    height: 52,
  },
  searchIcon: { fontSize: 20, color: colors.text.muted },
  searchPlaceholder: { ...typography.body, color: colors.text.muted },

  categories: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  category: { alignItems: 'center', gap: spacing.xs, flex: 1 },
  categoryIcon: { fontSize: 26 },
  categoryLabel: { ...typography.caption, color: colors.text.secondary, fontWeight: '500' },

  section: { marginTop: spacing.xxl },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  sectionTitle: { ...typography.h2, color: colors.text.primary },
  sectionLink: { ...typography.caption, color: colors.brand[700], fontWeight: '600' },
  sectionEmpty: {
    ...typography.caption,
    color: colors.text.muted,
    paddingHorizontal: spacing.lg,
  },
  carousel: { paddingHorizontal: spacing.lg, gap: spacing.md },
});
