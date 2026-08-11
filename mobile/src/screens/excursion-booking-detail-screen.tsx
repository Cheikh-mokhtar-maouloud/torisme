import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BookingStatus } from '@tourism/shared/constants';

import { useCancelExcursionBooking, useExcursion, useExcursionBooking } from '../api/queries';
import { Badge, Button, Card, Divider, ErrorState, Skeleton } from '../components/ui';
import { formatDateTime, formatMoney } from '../lib/format';
import { colors, spacing, typography } from '../theme';
import type { RootStackParamList } from '../navigation/types';
import { STATUS_LABELS } from './bookings-screen';

type Navigation = NativeStackNavigationProp<RootStackParamList>;

/**
 * Détail d'une réservation d'excursion, également utilisé comme écran de
 * confirmation juste après la demande — les deux affichent la même chose.
 */
export function ExcursionBookingDetailScreen({
  isConfirmation = false,
}: {
  isConfirmation?: boolean;
}) {
  const route =
    useRoute<
      RouteProp<RootStackParamList, 'ExcursionBookingDetail' | 'ExcursionBookingConfirmation'>
    >();
  const navigation = useNavigation<Navigation>();
  const insets = useSafeAreaInsets();
  const { bookingId } = route.params;

  const booking = useExcursionBooking(bookingId);
  const cancelBooking = useCancelExcursionBooking();
  const excursion = useExcursion(booking.data?.excursionId ?? '');

  if (booking.error) {
    return (
      <ErrorState
        message={booking.error instanceof Error ? booking.error.message : 'Chargement impossible.'}
        onRetry={() => void booking.refetch()}
      />
    );
  }

  if (booking.isLoading || !booking.data) {
    return (
      <View style={styles.screen}>
        <View style={styles.body}>
          <Skeleton height={28} width="55%" />
          <Skeleton height={120} style={styles.gap} />
        </View>
      </View>
    );
  }

  const data = booking.data;
  const status = STATUS_LABELS[data.status] ?? { label: data.status, tone: 'neutral' as const };
  const canCancel =
    data.status === BookingStatus.PENDING || data.status === BookingStatus.CONFIRMED;

  const confirmCancel = () => {
    Alert.alert(
      'Annuler la réservation',
      `La réservation ${data.reference} sera annulée et vos places remises en vente.`,
      [
        { text: 'Conserver', style: 'cancel' },
        {
          text: 'Annuler la réservation',
          style: 'destructive',
          onPress: () => cancelBooking.mutate(data.id),
        },
      ],
    );
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.body}>
        {isConfirmation ? (
          <View style={styles.confirmation}>
            <Text style={styles.confirmationIcon}>✓</Text>
            <Text style={styles.confirmationTitle}>Place réservée</Text>
            <Text style={styles.confirmationText}>
              L’organisateur va confirmer votre participation. Vous retrouverez cette réservation
              dans l’onglet Réservations.
            </Text>
          </View>
        ) : null}

        <View style={styles.headerRow}>
          <Text style={styles.reference}>{data.reference}</Text>
          <Badge label={status.label} tone={status.tone} />
        </View>

        {excursion.data ? <Text style={styles.excursionTitle}>{excursion.data.title}</Text> : null}

        <Card style={styles.card}>
          {excursion.data ? (
            <>
              <Row label="Départ" value={formatDateTime(excursion.data.startsAt)} />
              <Divider />
              <Row label="Destination" value={excursion.data.destination} />
              <Divider />
            </>
          ) : null}
          <Row label="Places" value={String(data.seats)} />
        </Card>

        <Card style={styles.card}>
          <Row
            label={`${formatMoney(data.unitPrice, data.currency)} × ${data.seats}`}
            value={formatMoney(data.unitPrice * data.seats, data.currency)}
          />
          <Divider />
          <Row label="Total" value={formatMoney(data.totalPrice, data.currency)} emphasis />
        </Card>

        {cancelBooking.error ? (
          <Text style={styles.error}>
            {cancelBooking.error instanceof Error
              ? cancelBooking.error.message
              : 'L’annulation a échoué.'}
          </Text>
        ) : null}

        <View style={styles.actions}>
          {isConfirmation ? (
            <Button
              label="Voir mes réservations"
              onPress={() => navigation.navigate('Tabs', { screen: 'Bookings' })}
            />
          ) : null}

          {canCancel ? (
            <Button
              label="Annuler la réservation"
              variant="secondary"
              onPress={confirmCancel}
              loading={cancelBooking.isPending}
            />
          ) : null}
        </View>
      </View>
    </ScrollView>
  );
}

export function ExcursionBookingConfirmationScreen() {
  return <ExcursionBookingDetailScreen isConfirmation />;
}

function Row({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, emphasis && styles.rowEmphasis]}>{label}</Text>
      <Text style={[styles.rowValue, emphasis && styles.rowEmphasis]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.subtle },
  body: { padding: spacing.lg, gap: spacing.md },
  gap: { marginTop: spacing.md },

  confirmation: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg },
  confirmationIcon: {
    fontSize: 28,
    color: colors.text.inverse,
    backgroundColor: colors.status.success,
    width: 56,
    height: 56,
    borderRadius: 28,
    textAlign: 'center',
    lineHeight: 56,
    overflow: 'hidden',
  },
  confirmationTitle: { ...typography.h2, color: colors.text.primary },
  confirmationText: {
    ...typography.body,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: 21,
  },

  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  reference: { ...typography.h2, color: colors.text.primary },
  excursionTitle: { ...typography.body, color: colors.text.secondary },

  card: { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.surface.border },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  rowLabel: { ...typography.body, color: colors.text.secondary },
  rowValue: { ...typography.body, color: colors.text.primary },
  rowEmphasis: { fontWeight: '700', color: colors.text.primary },

  error: { ...typography.caption, color: colors.status.danger },
  actions: { gap: spacing.sm, marginTop: spacing.md },
});
