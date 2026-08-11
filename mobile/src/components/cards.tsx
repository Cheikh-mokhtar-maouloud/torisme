import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Attraction, Excursion, Hotel, Restaurant } from '@tourism/shared/types';

import { colors, radius, spacing, typography } from '../theme';
import { formatMoney, formatShortDate } from '../lib/format';
import { PlaceImage } from './place-image';
import { Badge, Card, Rating, Skeleton } from './ui';

/**
 * Cartes de liste.
 *
 * Deux formats seulement : `HotelCard` en pleine largeur pour les listes
 * verticales, et une variante compacte pour les carrousels horizontaux de
 * l'accueil. Multiplier les formats rendrait l'application visuellement
 * incohérente d'un écran à l'autre.
 */

export function HotelCard({ hotel, onPress }: { hotel: Hotel; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${hotel.name}, ${hotel.address.city}`}
      onPress={onPress}
      style={({ pressed }) => [pressed && styles.pressed]}
    >
      <Card style={styles.wideCard}>
        <View style={styles.wideImage}>
          <PlaceImage images={hotel.images} name={hotel.name} rounded={false} />
        </View>

        <View style={styles.wideBody}>
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={1}>
              {hotel.name}
            </Text>
            {hotel.stars ? <Text style={styles.stars}>{'★'.repeat(hotel.stars)}</Text> : null}
          </View>

          <Text style={styles.subtitle} numberOfLines={1}>
            {hotel.address.city}
          </Text>

          <View style={styles.footerRow}>
            <Rating value={hotel.rating} count={hotel.reviewCount} />
            {hotel.minPricePerNight ? (
              <Text style={styles.price}>
                {formatMoney(hotel.minPricePerNight, hotel.currency)}
                <Text style={styles.priceUnit}> / nuit</Text>
              </Text>
            ) : null}
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

export function CompactCard({
  name,
  city,
  images,
  rating,
  reviewCount,
  footer,
  onPress,
}: {
  name: string;
  city: string;
  images: Hotel['images'];
  rating?: number;
  reviewCount?: number;
  footer?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name}
      onPress={onPress}
      style={({ pressed }) => [styles.compactCard, pressed && styles.pressed]}
    >
      <View style={styles.compactImage}>
        <PlaceImage images={images} name={name} rounded={false} />
      </View>
      <View style={styles.compactBody}>
        <Text style={styles.compactTitle} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {city}
        </Text>
        {footer ? (
          <Text style={styles.compactFooter}>{footer}</Text>
        ) : rating !== undefined && reviewCount !== undefined ? (
          <Rating value={rating} count={reviewCount} />
        ) : null}
      </View>
    </Pressable>
  );
}

export function RestaurantCard({
  restaurant,
  onPress,
}: {
  restaurant: Restaurant;
  onPress: () => void;
}) {
  return (
    <CompactCard
      name={restaurant.name}
      city={restaurant.address.city}
      images={restaurant.images}
      rating={restaurant.rating}
      reviewCount={restaurant.reviewCount}
      footer={'€'.repeat(restaurant.priceRange)}
      onPress={onPress}
    />
  );
}

export function AttractionCard({
  attraction,
  onPress,
}: {
  attraction: Attraction;
  onPress: () => void;
}) {
  return (
    <CompactCard
      name={attraction.name}
      city={attraction.address.city}
      images={attraction.images}
      footer={
        attraction.entryFee
          ? formatMoney(attraction.entryFee, attraction.currency ?? 'MRU')
          : 'Entrée gratuite'
      }
      onPress={onPress}
    />
  );
}

export function ExcursionCard({
  excursion,
  onPress,
}: {
  excursion: Excursion;
  onPress: () => void;
}) {
  const isNearlyFull = excursion.availableSeats > 0 && excursion.availableSeats <= 3;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={excursion.title}
      onPress={onPress}
      style={({ pressed }) => [styles.compactCard, pressed && styles.pressed]}
    >
      <View style={styles.compactImage}>
        <PlaceImage images={excursion.images} name={excursion.title} rounded={false} />
      </View>
      <View style={styles.compactBody}>
        <Text style={styles.compactTitle} numberOfLines={2}>
          {excursion.title}
        </Text>
        <Text style={styles.subtitle}>
          {formatShortDate(excursion.startsAt)} · {excursion.destination}
        </Text>
        <View style={styles.compactFooterRow}>
          <Text style={styles.price}>{formatMoney(excursion.price, excursion.currency)}</Text>
          {excursion.availableSeats === 0 ? (
            <Badge label="Complet" tone="danger" />
          ) : isNearlyFull ? (
            <Badge label={`${excursion.availableSeats} places`} tone="warning" />
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

/** Squelette calqué sur `HotelCard`, pour que la mise en page ne saute pas. */
export function CardSkeleton() {
  return (
    <Card style={styles.wideCard}>
      <Skeleton height={160} />
      <View style={styles.wideBody}>
        <Skeleton height={18} width="70%" />
        <Skeleton height={13} width="40%" style={styles.skeletonGap} />
        <Skeleton height={13} width="55%" style={styles.skeletonGap} />
      </View>
    </Card>
  );
}

export function CompactCardSkeleton() {
  return (
    <View style={styles.compactCard}>
      <Skeleton height={110} style={styles.compactSkeletonImage} />
      <View style={styles.compactBody}>
        <Skeleton height={15} width="80%" />
        <Skeleton height={12} width="50%" style={styles.skeletonGap} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.85 },

  wideCard: { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.surface.border },
  wideImage: { height: 160, width: '100%' },
  wideBody: { padding: spacing.md, gap: spacing.xs },

  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { ...typography.h3, color: colors.text.primary, flexShrink: 1 },
  stars: { color: colors.sand[500], fontSize: 12 },
  subtitle: { ...typography.caption, color: colors.text.secondary },

  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  price: { ...typography.body, color: colors.text.primary, fontWeight: '700' },
  priceUnit: { ...typography.caption, color: colors.text.muted, fontWeight: '400' },

  compactCard: {
    width: 210,
    backgroundColor: colors.surface.background,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.surface.border,
    overflow: 'hidden',
  },
  compactImage: { height: 110, width: '100%' },
  compactSkeletonImage: { borderRadius: 0 },
  compactBody: { padding: spacing.md, gap: 2 },
  compactTitle: { ...typography.body, fontWeight: '600', color: colors.text.primary },
  compactFooter: { ...typography.caption, color: colors.text.secondary, fontWeight: '600' },
  compactFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },

  skeletonGap: { marginTop: spacing.xs },
});
