import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BookingStatus } from '@tourism/shared/constants';
import type { Booking, ExcursionBooking } from '@tourism/shared/types';

import { useBookings, useExcursionBookings } from '../api/queries';
import { useAuth } from '../auth/auth-context';
import { Badge, Button, Card, EmptyState, ErrorState, Skeleton } from '../components/ui';
import { formatDate, formatMoney, formatNights, formatShortDate } from '../lib/format';
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
  const excursionBookings = useExcursionBookings(isAuthenticated);

  /*
   * Les deux types de réservation vivent dans des collections distinctes et sont
   * donc chargés séparément, puis fusionnés ici et triés par date de demande.
   *
   * Le tri se fait côté client parce que les deux listes sont plafonnées à 50
   * entrées : au-delà, il faudra un endpoint unifié côté serveur, la pagination
   * d'une fusion locale devenant fausse.
   */
  const entries: BookingEntry[] = [
    ...(bookings.data?.items ?? []).map((booking) => ({ kind: 'hotel' as const, booking })),
    ...(excursionBookings.data?.items ?? []).map((booking) => ({
      kind: 'excursion' as const,
      booking,
    })),
  ].sort((a, b) => b.booking.createdAt.localeCompare(a.booking.createdAt));

  const isLoading = bookings.isLoading || excursionBookings.isLoading;
  const error = bookings.error ?? excursionBookings.error;
  const isRefetching = bookings.isRefetching || excursionBookings.isRefetching;

  const refetchAll = () => {
    void bookings.refetch();
    void excursionBookings.refetch();
  };

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

      {error ? (
        <ErrorState
          message={error instanceof Error ? error.message : 'Chargement impossible.'}
          onRetry={refetchAll}
        />
      ) : isLoading ? (
        <View style={styles.list}>
          {[0, 1].map((index) => (
            <Skeleton key={index} height={110} />
          ))}
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(entry) => `${entry.kind}-${entry.booking.id}`}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xxl }]}
          showsVerticalScrollIndicator={false}
          refreshing={isRefetching}
          onRefresh={refetchAll}
          renderItem={({ item }) =>
            item.kind === 'hotel' ? (
              <BookingRow
                booking={item.booking}
                onPress={() => navigation.navigate('BookingDetail', { bookingId: item.booking.id })}
              />
            ) : (
              <ExcursionBookingRow
                booking={item.booking}
                onPress={() =>
                  navigation.navigate('ExcursionBookingDetail', { bookingId: item.booking.id })
                }
              />
            )
          }
          ListEmptyComponent={
            <EmptyState
              title="Aucune réservation"
              message="Vos futurs séjours et excursions apparaîtront ici."
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

/** Élément de liste unifié : les deux collections y coexistent. */
type BookingEntry =
  { kind: 'hotel'; booking: Booking } | { kind: 'excursion'; booking: ExcursionBooking };

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

function ExcursionBookingRow({
  booking,
  onPress,
}: {
  booking: ExcursionBooking;
  onPress: () => void;
}) {
  const status = STATUS_LABELS[booking.status] ?? {
    label: booking.status,
    tone: 'neutral' as const,
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Excursion ${booking.reference}, ${status.label}`}
      onPress={onPress}
      style={({ pressed }) => [pressed && styles.pressed]}
    >
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.referenceRow}>
            <Text style={styles.kindTag}>Excursion</Text>
            <Text style={styles.reference}>{booking.reference}</Text>
          </View>
          <Badge label={status.label} tone={status.tone} />
        </View>

        <Text style={styles.dates}>
          {booking.seats} place{booking.seats > 1 ? 's' : ''} · demandée le{' '}
          {formatDate(booking.createdAt)}
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
  referenceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  kindTag: {
    ...typography.caption,
    fontSize: 11,
    color: colors.brand[700],
    backgroundColor: colors.brand[50],
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  dates: { ...typography.caption, color: colors.text.secondary },
  total: { ...typography.h3, color: colors.text.primary, marginTop: spacing.xs },

  actionButton: { minWidth: 200 },
});
