import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Room } from '@tourism/shared/types';

import { PlaceType } from '@tourism/shared/constants';

import { Gallery } from '../components/gallery';
import { FavoriteButton, ReviewsSection } from '../components/social';
import { PlaceImage } from '../components/place-image';
import { Card, Chip, Divider, EmptyState, ErrorState, Rating, Skeleton } from '../components/ui';
import { useHotel, useHotelRooms } from '../api/queries';
import { formatMoney } from '../lib/format';
import { colors, radius, spacing, typography } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Navigation = NativeStackNavigationProp<RootStackParamList>;

export function HotelDetailScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'HotelDetail'>>();
  const navigation = useNavigation<Navigation>();
  const insets = useSafeAreaInsets();
  const { hotelId } = route.params;

  const hotel = useHotel(hotelId);
  const rooms = useHotelRooms(hotelId);

  if (hotel.error) {
    return (
      <ErrorState
        message={hotel.error instanceof Error ? hotel.error.message : 'Chargement impossible.'}
        onRetry={() => void hotel.refetch()}
      />
    );
  }

  if (hotel.isLoading || !hotel.data) {
    return (
      <View style={styles.loading}>
        <Skeleton height={240} style={styles.heroSkeleton} />
        <View style={styles.body}>
          <Skeleton height={24} width="70%" />
          <Skeleton height={14} width="40%" style={styles.gap} />
          <Skeleton height={80} style={styles.gap} />
        </View>
      </View>
    );
  }

  const place = hotel.data;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}
      showsVerticalScrollIndicator={false}
    >
      <Gallery images={place.images} name={place.name} height={260} />

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <View style={styles.titleText}>
            <Text style={styles.title}>{place.name}</Text>
            <Text style={styles.location}>
              {place.address.city}, {place.address.country}
            </Text>
          </View>
          <FavoriteButton targetType={PlaceType.HOTEL} targetId={place.id} />
        </View>

        <View style={styles.metaRow}>
          <Rating value={place.rating} count={place.reviewCount} />
          {place.stars ? <Text style={styles.stars}>{'★'.repeat(place.stars)}</Text> : null}
        </View>

        <Text style={styles.description}>{place.description}</Text>

        {place.amenities.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>Équipements</Text>
            <View style={styles.chips}>
              {place.amenities.map((amenity) => (
                <Chip key={amenity} label={amenity} />
              ))}
            </View>
          </>
        ) : null}

        <Text style={styles.sectionTitle}>Informations pratiques</Text>
        <Card style={styles.infoCard}>
          <InfoRow label="Arrivée" value={`à partir de ${place.checkInTime}`} />
          <Divider />
          <InfoRow label="Départ" value={`avant ${place.checkOutTime}`} />
          {place.phone ? (
            <>
              <Divider />
              <InfoRow label="Téléphone" value={place.phone} />
            </>
          ) : null}
        </Card>

        {place.rules && place.rules.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>Règles de l’établissement</Text>
            {place.rules.map((rule) => (
              <Text key={rule} style={styles.rule}>
                • {rule}
              </Text>
            ))}
          </>
        ) : null}

        <Text style={styles.sectionTitle}>Chambres disponibles</Text>

        {rooms.error ? (
          <ErrorState
            message="Les chambres n’ont pas pu être chargées."
            onRetry={() => void rooms.refetch()}
          />
        ) : rooms.isLoading ? (
          <View style={styles.gap}>
            <Skeleton height={90} />
          </View>
        ) : rooms.data?.items.length === 0 ? (
          <EmptyState
            title="Aucune chambre disponible"
            message="Cet établissement n’a pas encore de chambre réservable."
          />
        ) : (
          <View style={styles.roomList}>
            {rooms.data?.items.map((room) => (
              <RoomRow
                key={room.id}
                room={room}
                onPress={() =>
                  navigation.navigate('RoomDetail', { roomId: room.id, roomName: room.name })
                }
              />
            ))}
          </View>
        )}

        <ReviewsSection targetType={PlaceType.HOTEL} targetId={place.id} targetName={place.name} />
      </View>
    </ScrollView>
  );
}

function RoomRow({ room, onPress }: { room: Room; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${room.name}, ${formatMoney(room.pricePerNight, room.currency)} par nuit`}
      onPress={onPress}
      style={({ pressed }) => [styles.roomRow, pressed && styles.pressed]}
    >
      <View style={styles.roomThumb}>
        <PlaceImage images={room.images} name={room.name} rounded={false} />
      </View>

      <View style={styles.roomInfo}>
        <Text style={styles.roomName} numberOfLines={1}>
          {room.name}
        </Text>
        <Text style={styles.roomMeta}>
          {room.capacity} pers. · {room.bedCount} lit{room.bedCount > 1 ? 's' : ''}
        </Text>
        <Text style={styles.roomPrice}>
          {formatMoney(room.pricePerNight, room.currency)}
          <Text style={styles.roomPriceUnit}> / nuit</Text>
        </Text>
      </View>

      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.background },
  loading: { flex: 1, backgroundColor: colors.surface.background },
  heroSkeleton: { borderRadius: 0 },
  pressed: { opacity: 0.8 },

  hero: { height: 240, width: '100%' },
  body: { padding: spacing.lg, gap: spacing.xs },

  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  titleText: { flex: 1 },
  title: { ...typography.h1, color: colors.text.primary },
  location: { ...typography.body, color: colors.text.secondary },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  stars: { color: colors.sand[500], fontSize: 13 },
  description: {
    ...typography.body,
    color: colors.text.secondary,
    lineHeight: 22,
    marginTop: spacing.md,
  },

  sectionTitle: {
    ...typography.h3,
    color: colors.text.primary,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  rule: { ...typography.body, color: colors.text.secondary, lineHeight: 22 },

  infoCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.surface.border,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  infoLabel: { ...typography.body, color: colors.text.secondary },
  infoValue: { ...typography.body, color: colors.text.primary, fontWeight: '600' },

  roomList: { gap: spacing.md },
  roomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface.background,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.surface.border,
    padding: spacing.sm,
  },
  roomThumb: { width: 84, height: 84, borderRadius: radius.md, overflow: 'hidden' },
  roomInfo: { flex: 1, gap: 2 },
  roomName: { ...typography.body, fontWeight: '600', color: colors.text.primary },
  roomMeta: { ...typography.caption, color: colors.text.secondary },
  roomPrice: { ...typography.body, fontWeight: '700', color: colors.text.primary, marginTop: 2 },
  roomPriceUnit: { ...typography.caption, color: colors.text.muted, fontWeight: '400' },
  // `paddingEnd` : voir la note sur le sens d'écriture dans src/i18n/index.ts.
  chevron: { fontSize: 28, color: colors.text.muted, paddingEnd: spacing.sm },

  gap: { marginTop: spacing.sm },
});
