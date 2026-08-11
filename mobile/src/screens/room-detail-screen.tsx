import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PlaceImage } from '../components/place-image';
import { Button, Chip, ErrorState, Skeleton } from '../components/ui';
import { useRoom } from '../api/queries';
import { formatMoney } from '../lib/format';
import { colors, spacing, typography } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Navigation = NativeStackNavigationProp<RootStackParamList>;

export function RoomDetailScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'RoomDetail'>>();
  const navigation = useNavigation<Navigation>();
  const insets = useSafeAreaInsets();
  const { roomId } = route.params;

  const room = useRoom(roomId);

  if (room.error) {
    return (
      <ErrorState
        message={room.error instanceof Error ? room.error.message : 'Chargement impossible.'}
        onRetry={() => void room.refetch()}
      />
    );
  }

  if (room.isLoading || !room.data) {
    return (
      <View style={styles.screen}>
        <Skeleton height={220} style={styles.heroSkeleton} />
        <View style={styles.body}>
          <Skeleton height={22} width="60%" />
          <Skeleton height={14} width="35%" style={styles.gap} />
        </View>
      </View>
    );
  }

  const data = room.data;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <PlaceImage images={data.images} name={data.name} rounded={false} />
        </View>

        <View style={styles.body}>
          <Text style={styles.title}>{data.name}</Text>
          <Text style={styles.meta}>
            {data.capacity} voyageur{data.capacity > 1 ? 's' : ''} · {data.bedCount} lit
            {data.bedCount > 1 ? 's' : ''}
          </Text>

          <Text style={styles.description}>{data.description}</Text>

          {data.amenities.length > 0 ? (
            <>
              <Text style={styles.sectionTitle}>Équipements</Text>
              <View style={styles.chips}>
                {data.amenities.map((amenity) => (
                  <Chip key={amenity} label={amenity} />
                ))}
              </View>
            </>
          ) : null}
        </View>
      </ScrollView>

      {/*
        Barre d'action fixée en bas : le prix et le bouton de réservation
        restent atteignables sans remonter, quelle que soit la longueur de la
        description.
      */}
      <View style={[styles.actionBar, { paddingBottom: insets.bottom + spacing.md }]}>
        <View>
          <Text style={styles.price}>{formatMoney(data.pricePerNight, data.currency)}</Text>
          <Text style={styles.priceUnit}>par nuit</Text>
        </View>
        <Button
          label="Choisir les dates"
          onPress={() => navigation.navigate('BookingFlow', { roomId: data.id })}
          style={styles.actionButton}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.background },
  scroll: { paddingBottom: spacing.xxl },
  heroSkeleton: { borderRadius: 0 },

  hero: { height: 220, width: '100%' },
  body: { padding: spacing.lg, gap: spacing.xs },

  title: { ...typography.h1, color: colors.text.primary },
  meta: { ...typography.body, color: colors.text.secondary },
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

  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.surface.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.surface.border,
  },
  price: { ...typography.h3, color: colors.text.primary },
  priceUnit: { ...typography.caption, color: colors.text.muted },
  actionButton: { flex: 1 },

  gap: { marginTop: spacing.sm },
});
