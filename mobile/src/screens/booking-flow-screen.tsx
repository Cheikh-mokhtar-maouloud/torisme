import { useState } from 'react';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BOOKING } from '@tourism/shared/constants';

import { ApiRequestError } from '../api/client';
import { useAvailability, useCreateBooking, useRoom } from '../api/queries';
import { useAuth } from '../auth/auth-context';
import { Badge, Button, Card, Divider, ErrorState, Skeleton } from '../components/ui';
import { addDays, formatDate, formatMoney, formatNights, toApiDate } from '../lib/format';
import { colors, radius, spacing, typography } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Navigation = NativeStackNavigationProp<RootStackParamList>;

/**
 * Sélection des dates, du nombre de voyageurs et récapitulatif.
 *
 * Le prix total et la disponibilité proviennent **exclusivement** du serveur :
 * l'application ne multiplie jamais un prix par un nombre de nuits pour
 * l'afficher. Un montant calculé localement finirait par diverger de celui
 * facturé — et serait manipulable.
 */
export function BookingFlowScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'BookingFlow'>>();
  const navigation = useNavigation<Navigation>();
  const insets = useSafeAreaInsets();
  const { isAuthenticated } = useAuth();
  const { roomId } = route.params;

  const today = new Date();
  const [checkIn, setCheckIn] = useState(() => addDays(today, 1));
  const [nights, setNights] = useState(2);
  const [guests, setGuests] = useState(2);

  const checkOut = addDays(checkIn, nights);

  const room = useRoom(roomId);
  const availability = useAvailability(roomId, toApiDate(checkIn), toApiDate(checkOut));
  const createBooking = useCreateBooking();

  const maxGuests = room.data?.capacity ?? BOOKING.MAX_GUESTS;

  const handleSubmit = () => {
    // La connexion n'est exigée qu'ici, au dernier moment : imposer un compte
    // avant d'avoir vu le prix ferait abandonner l'essentiel des visiteurs.
    if (!isAuthenticated) {
      navigation.navigate('Login', {
        message: 'Connectez-vous pour finaliser votre réservation.',
      });
      return;
    }

    createBooking.mutate(
      {
        roomId,
        checkIn: new Date(toApiDate(checkIn)),
        checkOut: new Date(toApiDate(checkOut)),
        guests,
      },
      {
        onSuccess: (booking) =>
          navigation.replace('BookingConfirmation', { bookingId: booking.id }),
      },
    );
  };

  if (room.error) {
    return (
      <ErrorState
        message={room.error instanceof Error ? room.error.message : 'Chargement impossible.'}
        onRetry={() => void room.refetch()}
      />
    );
  }

  const submitError = createBooking.error;

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.sectionTitle}>Dates du séjour</Text>

        <Card style={styles.card}>
          <Stepper
            label="Arrivée"
            value={formatDate(checkIn)}
            // Le passé est refusé par l'API : on empêche aussi de l'atteindre.
            onDecrement={
              toApiDate(checkIn) > toApiDate(addDays(today, 1))
                ? () => setCheckIn(addDays(checkIn, -1))
                : undefined
            }
            onIncrement={() => setCheckIn(addDays(checkIn, 1))}
          />
          <Divider />
          <Stepper
            label="Nuits"
            value={formatNights(nights)}
            onDecrement={nights > 1 ? () => setNights(nights - 1) : undefined}
            onIncrement={nights < BOOKING.MAX_NIGHTS ? () => setNights(nights + 1) : undefined}
          />
          <Divider />
          <Stepper
            label="Voyageurs"
            value={String(guests)}
            onDecrement={guests > 1 ? () => setGuests(guests - 1) : undefined}
            // Bloqué à la capacité de la chambre : l'API refuserait au-delà,
            // autant l'empêcher avant la soumission.
            onIncrement={guests < maxGuests ? () => setGuests(guests + 1) : undefined}
          />
        </Card>

        <Text style={styles.hint}>Départ le {formatDate(checkOut)}</Text>

        <Text style={styles.sectionTitle}>Récapitulatif</Text>

        {availability.isLoading ? (
          <Card style={styles.card}>
            <View style={styles.summaryPadding}>
              <Skeleton height={16} width="60%" />
              <Skeleton height={16} width="40%" style={styles.gap} />
              <Skeleton height={22} width="50%" style={styles.gap} />
            </View>
          </Card>
        ) : availability.error ? (
          <ErrorState
            message={
              availability.error instanceof Error
                ? availability.error.message
                : 'Disponibilité indisponible.'
            }
            onRetry={() => void availability.refetch()}
          />
        ) : availability.data ? (
          <Card style={styles.card}>
            <SummaryRow
              label={`${formatMoney(availability.data.unitPrice, availability.data.currency)} × ${formatNights(availability.data.nights)}`}
              value={formatMoney(
                availability.data.unitPrice * availability.data.nights,
                availability.data.currency,
              )}
            />
            <Divider />
            <SummaryRow
              label="Total"
              value={formatMoney(availability.data.totalPrice, availability.data.currency)}
              emphasis
            />
          </Card>
        ) : null}

        {availability.data && !availability.data.isAvailable ? (
          <View style={styles.unavailable}>
            <Badge label="Complet" tone="danger" />
            <Text style={styles.unavailableText}>
              Cette chambre n’est plus disponible sur ces dates. Essayez d’autres jours.
            </Text>
          </View>
        ) : availability.data && availability.data.availableUnits <= 2 ? (
          <View style={styles.unavailable}>
            <Badge
              label={`Plus que ${availability.data.availableUnits} chambre${availability.data.availableUnits > 1 ? 's' : ''}`}
              tone="warning"
            />
          </View>
        ) : null}

        {submitError ? (
          <Text style={styles.submitError}>
            {submitError instanceof ApiRequestError
              ? submitError.message
              : 'La réservation a échoué. Réessayez.'}
          </Text>
        ) : null}
      </ScrollView>

      <View style={[styles.actionBar, { paddingBottom: insets.bottom + spacing.md }]}>
        <Button
          label={isAuthenticated ? 'Réserver' : 'Se connecter pour réserver'}
          onPress={handleSubmit}
          loading={createBooking.isPending}
          disabled={availability.isLoading || availability.data?.isAvailable === false}
        />
        <Text style={styles.actionNote}>
          Aucun paiement à cette étape. Votre demande sera confirmée par l’établissement.
        </Text>
      </View>
    </View>
  );
}

/**
 * Sélecteur par incréments plutôt que calendrier natif.
 *
 * Un séjour touristique se choisit sur quelques jours : deux appuis suffisent
 * là où un calendrier modal demanderait une dépendance supplémentaire et une
 * gestion de fuseaux. Un vrai sélecteur de dates viendra si l'usage le montre
 * nécessaire.
 */
function Stepper({
  label,
  value,
  onDecrement,
  onIncrement,
}: {
  label: string;
  value: string;
  onDecrement?: (() => void) | undefined;
  onIncrement?: (() => void) | undefined;
}) {
  return (
    <View style={styles.stepper}>
      <View style={styles.stepperText}>
        <Text style={styles.stepperLabel}>{label}</Text>
        <Text style={styles.stepperValue}>{value}</Text>
      </View>

      <View style={styles.stepperControls}>
        <StepperButton label="−" accessibilityLabel={`Diminuer ${label}`} onPress={onDecrement} />
        <StepperButton label="+" accessibilityLabel={`Augmenter ${label}`} onPress={onIncrement} />
      </View>
    </View>
  );
}

function StepperButton({
  label,
  accessibilityLabel,
  onPress,
}: {
  label: string;
  accessibilityLabel: string;
  onPress?: (() => void) | undefined;
}) {
  const disabled = onPress === undefined;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      onPress={onPress}
      disabled={disabled}
      // Zone tactile élargie : la cible visuelle fait 36 px, en dessous des
      // 44 px recommandés pour un appui fiable au pouce.
      hitSlop={8}
      style={({ pressed }) => [
        styles.stepperButton,
        disabled && styles.stepperButtonDisabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text style={[styles.stepperButtonLabel, disabled && styles.stepperButtonLabelDisabled]}>
        {label}
      </Text>
    </Pressable>
  );
}

function SummaryRow({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <View style={styles.summaryRow}>
      <Text style={[styles.summaryLabel, emphasis && styles.summaryEmphasis]}>{label}</Text>
      <Text style={[styles.summaryValue, emphasis && styles.summaryEmphasis]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.subtle },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  pressed: { opacity: 0.6 },
  gap: { marginTop: spacing.sm },

  sectionTitle: {
    ...typography.h3,
    color: colors.text.primary,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.surface.border,
  },
  hint: { ...typography.caption, color: colors.text.muted, marginTop: spacing.sm },

  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  stepperText: { gap: 2 },
  stepperLabel: { ...typography.caption, color: colors.text.secondary },
  stepperValue: { ...typography.body, color: colors.text.primary, fontWeight: '600' },
  stepperControls: { flexDirection: 'row', gap: spacing.sm },
  stepperButton: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.brand[600],
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButtonDisabled: { borderColor: colors.surface.border },
  stepperButtonLabel: { fontSize: 20, color: colors.brand[600], lineHeight: 24 },
  stepperButtonLabelDisabled: { color: colors.text.muted },

  summaryPadding: { padding: spacing.lg },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  summaryLabel: { ...typography.body, color: colors.text.secondary },
  summaryValue: { ...typography.body, color: colors.text.primary },
  summaryEmphasis: { fontWeight: '700', color: colors.text.primary },

  unavailable: {
    marginTop: spacing.md,
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  unavailableText: { ...typography.caption, color: colors.text.secondary },

  submitError: {
    ...typography.caption,
    color: colors.status.danger,
    marginTop: spacing.md,
  },

  actionBar: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.sm,
    backgroundColor: colors.surface.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.surface.border,
  },
  actionNote: { ...typography.caption, color: colors.text.muted, textAlign: 'center' },
});
