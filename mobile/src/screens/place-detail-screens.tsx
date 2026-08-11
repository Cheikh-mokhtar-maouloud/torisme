import { useRoute, type RouteProp } from '@react-navigation/native';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Attraction, Excursion, Restaurant } from '@tourism/shared/types';

import { useAttractions, useExcursions, useRestaurants } from '../api/queries';
import { PlaceImage } from '../components/place-image';
import { Badge, Card, Chip, Divider, ErrorState, Rating, Skeleton } from '../components/ui';
import { formatDateTime, formatDuration, formatMoney } from '../lib/format';
import { colors, spacing, typography } from '../theme';
import type { RootStackParamList } from '../navigation/types';

/**
 * Fiches restaurant, attraction et excursion.
 *
 * Ces trois écrans lisent l'élément dans la liste déjà chargée plutôt que par
 * un appel dédié : l'utilisateur y arrive toujours depuis une liste, la donnée
 * est donc en cache et l'affichage est immédiat. Un endpoint de détail par
 * identifiant existe côté API et sera utilisé quand les fiches s'enrichiront
 * (galeries en Phase 7, avis en Phase 10).
 */

export function RestaurantDetailScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'RestaurantDetail'>>();
  const query = useRestaurants();
  const restaurant = query.data?.items.find(
    (item: Restaurant) => item.id === route.params.restaurantId,
  );

  return (
    <PlaceLayout
      isLoading={query.isLoading}
      error={query.error}
      onRetry={() => void query.refetch()}
      images={restaurant?.images ?? []}
      name={restaurant?.name ?? route.params.name ?? ''}
      city={restaurant?.address.city}
      country={restaurant?.address.country}
      description={restaurant?.description}
    >
      {restaurant ? (
        <>
          <View style={styles.metaRow}>
            <Rating value={restaurant.rating} count={restaurant.reviewCount} />
            <Text style={styles.priceRange}>{'€'.repeat(restaurant.priceRange)}</Text>
          </View>

          {restaurant.cuisineTypes.length > 0 ? (
            <>
              <Text style={styles.sectionTitle}>Cuisine</Text>
              <View style={styles.chips}>
                {restaurant.cuisineTypes.map((cuisine) => (
                  <Chip key={cuisine} label={cuisine} />
                ))}
              </View>
            </>
          ) : null}

          {restaurant.phone ? (
            <Card style={styles.card}>
              <Row label="Téléphone" value={restaurant.phone} />
            </Card>
          ) : null}
        </>
      ) : null}
    </PlaceLayout>
  );
}

export function AttractionDetailScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'AttractionDetail'>>();
  const query = useAttractions();
  const attraction = query.data?.items.find(
    (item: Attraction) => item.id === route.params.attractionId,
  );

  return (
    <PlaceLayout
      isLoading={query.isLoading}
      error={query.error}
      onRetry={() => void query.refetch()}
      images={attraction?.images ?? []}
      name={attraction?.name ?? route.params.name ?? ''}
      city={attraction?.address.city}
      country={attraction?.address.country}
      description={attraction?.description}
    >
      {attraction ? (
        <>
          <View style={styles.metaRow}>
            <Rating value={attraction.rating} count={attraction.reviewCount} />
          </View>

          <Card style={styles.card}>
            <Row
              label="Entrée"
              value={
                attraction.entryFee
                  ? formatMoney(attraction.entryFee, attraction.currency ?? 'MRU')
                  : 'Gratuite'
              }
            />
          </Card>
        </>
      ) : null}
    </PlaceLayout>
  );
}

export function ExcursionDetailScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'ExcursionDetail'>>();
  const query = useExcursions();
  const excursion = query.data?.items.find(
    (item: Excursion) => item.id === route.params.excursionId,
  );

  return (
    <PlaceLayout
      isLoading={query.isLoading}
      error={query.error}
      onRetry={() => void query.refetch()}
      images={excursion?.images ?? []}
      name={excursion?.title ?? route.params.title ?? ''}
      city={excursion?.destination}
      description={excursion?.description}
    >
      {excursion ? (
        <>
          <View style={styles.metaRow}>
            <Text style={styles.price}>{formatMoney(excursion.price, excursion.currency)}</Text>
            {excursion.availableSeats === 0 ? (
              <Badge label="Complet" tone="danger" />
            ) : (
              <Badge label={`${excursion.availableSeats} places restantes`} tone="success" />
            )}
          </View>

          <Card style={styles.card}>
            <Row label="Départ" value={formatDateTime(excursion.startsAt)} />
            <Divider />
            <Row label="Durée" value={formatDuration(excursion.durationMinutes)} />
            {excursion.guideName ? (
              <>
                <Divider />
                <Row label="Guide" value={excursion.guideName} />
              </>
            ) : null}
          </Card>

          {excursion.itinerary.length > 0 ? (
            <>
              <Text style={styles.sectionTitle}>Programme</Text>
              <View style={styles.itinerary}>
                {excursion.itinerary.map((step, index) => (
                  <View key={`${step.title}-${index}`} style={styles.step}>
                    <View style={styles.stepMarker} />
                    <View style={styles.stepBody}>
                      <Text style={styles.stepTitle}>
                        {step.time ? `${step.time} — ` : ''}
                        {step.title}
                      </Text>
                      {step.description ? (
                        <Text style={styles.stepDescription}>{step.description}</Text>
                      ) : null}
                    </View>
                  </View>
                ))}
              </View>
            </>
          ) : null}

          <Text style={styles.note}>La réservation d’excursion arrive en Phase 9.</Text>
        </>
      ) : null}
    </PlaceLayout>
  );
}

function PlaceLayout({
  isLoading,
  error,
  onRetry,
  images,
  name,
  city,
  country,
  description,
  children,
}: {
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
  images: Attraction['images'];
  name: string;
  city?: string | undefined;
  country?: string | undefined;
  description?: string | undefined;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();

  if (error) {
    return (
      <ErrorState
        message={error instanceof Error ? error.message : 'Chargement impossible.'}
        onRetry={onRetry}
      />
    );
  }

  if (isLoading) {
    return (
      <View style={styles.screen}>
        <Skeleton height={220} style={styles.heroSkeleton} />
        <View style={styles.body}>
          <Skeleton height={24} width="65%" />
          <Skeleton height={14} width="40%" style={styles.gap} />
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.hero}>
        <PlaceImage images={images} name={name} rounded={false} />
      </View>

      <View style={styles.body}>
        <Text style={styles.title}>{name}</Text>
        {city ? (
          <Text style={styles.location}>{country ? `${city}, ${country}` : city}</Text>
        ) : null}
        {description ? <Text style={styles.description}>{description}</Text> : null}
        {children}
      </View>
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.background },
  heroSkeleton: { borderRadius: 0 },
  hero: { height: 220, width: '100%' },
  body: { padding: spacing.lg, gap: spacing.xs },
  gap: { marginTop: spacing.sm },

  title: { ...typography.h1, color: colors.text.primary },
  location: { ...typography.body, color: colors.text.secondary },
  description: {
    ...typography.body,
    color: colors.text.secondary,
    lineHeight: 22,
    marginTop: spacing.md,
  },

  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  priceRange: { ...typography.body, color: colors.text.primary, fontWeight: '600' },
  price: { ...typography.h3, color: colors.text.primary },

  sectionTitle: {
    ...typography.h3,
    color: colors.text.primary,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },

  card: {
    marginTop: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.surface.border,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  rowLabel: { ...typography.body, color: colors.text.secondary },
  rowValue: { ...typography.body, color: colors.text.primary, fontWeight: '500' },

  itinerary: { gap: spacing.md },
  step: { flexDirection: 'row', gap: spacing.md },
  stepMarker: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.brand[600],
    marginTop: 6,
  },
  stepBody: { flex: 1, gap: 2 },
  stepTitle: { ...typography.body, color: colors.text.primary, fontWeight: '600' },
  stepDescription: { ...typography.caption, color: colors.text.secondary, lineHeight: 19 },

  note: {
    ...typography.caption,
    color: colors.text.muted,
    marginTop: spacing.xl,
    fontStyle: 'italic',
  },
});
