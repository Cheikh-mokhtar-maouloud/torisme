import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BookingStatus } from '@tourism/shared/constants';
import type { Booking } from '@tourism/shared/types';

import { useBookings } from '../api/queries';
import { useAuth } from '../auth/auth-context';
import { Badge, Button, Card, EmptyState, ErrorState, Skeleton } from '../components/ui';
import { formatMoney, formatNights, formatShortDate } from '../lib/format';
import { colors, spacing, typography } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Navigation = NativeStackNavigationProp<RootStackParamList>;

export const STATUS_LABELS: Record<
  string,
  { label: string; tone: 'neutral' | 'success' | 'warning' | 'danger' }
> = {
  [BookingStatus.PENDING]: { label: 'En attente', tone: 'warning' },
  [BookingStatus.CONFIRMED]: { label: 'Confirmée', tone: 'success' },
  [BookingStatus.CANCELLED]: { label: 'Annulée', tone: 'danger' },
  [BookingStatus.COMPLETED]: { label: 'Terminée', tone: 'neutral' },
};

export function BookingsScreen() {
  const navigation = useNavigation<Navigation>();
  const insets = useSafeAreaInsets();
  const { isAuthenticated } = useAuth();

  const bookings = useBookings(isAuthenticated);

  if (!isAuthenticated) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <EmptyState
          title="Vos réservations"
          message="Connectez-vous pour retrouver vos séjours et suivre leur statut."
          action={
            <Button
              label="Se connecter"
              onPress={() => navigation.navigate('Login')}
              style={styles.actionButton}
            />
          }
        />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <Text style={styles.heading}>Mes réservations</Text>

      {bookings.error ? (
        <ErrorState
          message={
            bookings.error instanceof Error ? bookings.error.message : 'Chargement impossible.'
          }
          onRetry={() => void bookings.refetch()}
        />
      ) : bookings.isLoading ? (
        <View style={styles.list}>
          {[0, 1].map((index) => (
            <Skeleton key={index} height={110} />
          ))}
        </View>
      ) : (
        <FlatList
          data={bookings.data?.items ?? []}
          keyExtractor={(booking) => booking.id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xxl }]}
          showsVerticalScrollIndicator={false}
          refreshing={bookings.isRefetching}
          onRefresh={() => void bookings.refetch()}
          renderItem={({ item }) => (
            <BookingRow
              booking={item}
              onPress={() => navigation.navigate('BookingDetail', { bookingId: item.id })}
            />
          )}
          ListEmptyComponent={
            <EmptyState
              title="Aucune réservation"
              message="Vos futurs séjours apparaîtront ici."
              action={
                <Button
                  label="Explorer les hôtels"
                  variant="secondary"
                  onPress={() => navigation.navigate('Tabs', { screen: 'Explore' })}
                  style={styles.actionButton}
                />
              }
            />
          }
        />
      )}
    </View>
  );
}

export function BookingRow({ booking, onPress }: { booking: Booking; onPress: () => void }) {
  const status = STATUS_LABELS[booking.status] ?? {
    label: booking.status,
    tone: 'neutral' as const,
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Réservation ${booking.reference}, ${status.label}`}
      onPress={onPress}
      style={({ pressed }) => [pressed && styles.pressed]}
    >
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.reference}>{booking.reference}</Text>
          <Badge label={status.label} tone={status.tone} />
        </View>

        <Text style={styles.dates}>
          {formatShortDate(booking.checkIn)} → {formatShortDate(booking.checkOut)} ·{' '}
          {formatNights(booking.nights)}
        </Text>

        <Text style={styles.total}>{formatMoney(booking.totalPrice, booking.currency)}</Text>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.subtle },
  centered: { flex: 1, justifyContent: 'center', backgroundColor: colors.surface.subtle },
  pressed: { opacity: 0.85 },

  heading: {
    ...typography.h1,
    color: colors.text.primary,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  list: { paddingHorizontal: spacing.lg, gap: spacing.md },

  card: {
    padding: spacing.lg,
    gap: spacing.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.surface.border,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  reference: { ...typography.body, fontWeight: '700', color: colors.text.primary },
  dates: { ...typography.caption, color: colors.text.secondary },
  total: { ...typography.h3, color: colors.text.primary, marginTop: spacing.xs },

  actionButton: { minWidth: 200 },
});
