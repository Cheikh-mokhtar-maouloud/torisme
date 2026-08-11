import { useState } from 'react';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MAX_SEATS_PER_BOOKING } from '@tourism/shared/validation';

import { ApiRequestError } from '../api/client';
import { useCreateExcursionBooking, useExcursion } from '../api/queries';
import { useAuth } from '../auth/auth-context';
import { Badge, Button, Card, Divider, ErrorState, Skeleton } from '../components/ui';
import { formatDateTime, formatDuration, formatMoney } from '../lib/format';
import { colors, radius, spacing, typography } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Navigation = NativeStackNavigationProp<RootStackParamList>;

/**
 * Réservation de places sur une excursion.
 *
 * Plus simple que la réservation d'hébergement : ni dates ni disponibilité à
 * interroger, l'excursion ayant une date fixe et un nombre de places connu.
 * Le total reste calculé par le serveur au moment de la réservation ; celui
 * affiché ici n'est qu'une indication, et l'écran ne prétend pas le contraire.
 */
export function ExcursionBookingScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'ExcursionBooking'>>();
  const navigation = useNavigation<Navigation>();
  const insets = useSafeAreaInsets();
  const { isAuthenticated } = useAuth();
  const { excursionId } = route.params;

  const [seats, setSeats] = useState(1);

  const excursion = useExcursion(excursionId);
  const createBooking = useCreateExcursionBooking();

  if (excursion.error) {
    return (
      <ErrorState
        message={
          excursion.error instanceof Error ? excursion.error.message : 'Chargement impossible.'
        }
        onRetry={() => void excursion.refetch()}
      />
    );
  }

  if (excursion.isLoading || !excursion.data) {
    return (
      <View style={styles.screen}>
        <View style={styles.body}>
          <Skeleton height={24} width="65%" />
          <Skeleton height={120} style={styles.gap} />
        </View>
      </View>
    );
  }

  const data = excursion.data;

  // Le plafond effectif est le plus petit des deux : places restantes et
  // maximum par réservation.
  const maxSeats = Math.min(data.availableSeats, MAX_SEATS_PER_BOOKING);
  const isSoldOut = data.availableSeats === 0;

  const handleSubmit = () => {
    if (!isAuthenticated) {
      navigation.navigate('Login', {
        message: 'Connectez-vous pour réserver votre place.',
      });
      return;
    }

    createBooking.mutate(
      { excursionId, seats },
      {
        onSuccess: (booking) =>
          navigation.replace('ExcursionBookingConfirmation', { bookingId: booking.id }),
      },
    );
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>{data.title}</Text>
        <Text style={styles.subtitle}>{data.destination}</Text>

        <Card style={styles.card}>
          <Row label="Départ" value={formatDateTime(data.startsAt)} />
          <Divider />
          <Row label="Durée" value={formatDuration(data.durationMinutes)} />
          <Divider />
          <Row label="Places restantes" value={`${data.availableSeats} sur ${data.totalSeats}`} />
        </Card>

        {isSoldOut ? (
          <View style={styles.notice}>
            <Badge label="Complet" tone="danger" />
            <Text style={styles.noticeText}>
              Toutes les places sont réservées. Une annulation peut en libérer.
            </Text>
          </View>
        ) : (
          <>
            <Text style={styles.sectionTitle}>Nombre de places</Text>
            <Card style={styles.card}>
              <View style={styles.stepper}>
                <View>
                  <Text style={styles.stepperLabel}>Voyageurs</Text>
                  <Text style={styles.stepperValue}>
                    {seats} place{seats > 1 ? 's' : ''}
                  </Text>
                </View>
                <View style={styles.stepperControls}>
                  <StepperButton
                    label="−"
                    accessibilityLabel="Retirer une place"
                    onPress={seats > 1 ? () => setSeats(seats - 1) : undefined}
                  />
                  <StepperButton
                    label="+"
                    accessibilityLabel="Ajouter une place"
                    onPress={seats < maxSeats ? () => setSeats(seats + 1) : undefined}
                  />
                </View>
              </View>
            </Card>

            {data.availableSeats <= 3 ? (
              <Text style={styles.warning}>
                Plus que {data.availableSeats} place{data.availableSeats > 1 ? 's' : ''} — réservez
                vite.
              </Text>
            ) : null}

            <Text style={styles.sectionTitle}>Récapitulatif</Text>
            <Card style={styles.card}>
              <Row
                label={`${formatMoney(data.price, data.currency)} × ${seats}`}
                value={formatMoney(data.price * seats, data.currency)}
              />
              <Divider />
              <Row label="Total" value={formatMoney(data.price * seats, data.currency)} emphasis />
            </Card>
          </>
        )}

        {createBooking.error ? (
          <Text style={styles.error}>
            {createBooking.error instanceof ApiRequestError
              ? createBooking.error.message
              : 'La réservation a échoué. Réessayez.'}
          </Text>
        ) : null}
      </ScrollView>

      <View style={[styles.actionBar, { paddingBottom: insets.bottom + spacing.md }]}>
        <Button
          label={isAuthenticated ? 'Réserver ma place' : 'Se connecter pour réserver'}
          onPress={handleSubmit}
          loading={createBooking.isPending}
          disabled={isSoldOut}
        />
        <Text style={styles.actionNote}>
          Aucun paiement à cette étape. Votre demande sera confirmée par l’organisateur.
        </Text>
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
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  body: { padding: spacing.lg, gap: spacing.md },
  pressed: { opacity: 0.6 },
  gap: { marginTop: spacing.md },

  title: { ...typography.h2, color: colors.text.primary },
  subtitle: { ...typography.body, color: colors.text.secondary, marginBottom: spacing.md },
  sectionTitle: {
    ...typography.h3,
    color: colors.text.primary,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
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

  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
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

  notice: { marginTop: spacing.lg, gap: spacing.sm, alignItems: 'flex-start' },
  noticeText: { ...typography.caption, color: colors.text.secondary },
  warning: { ...typography.caption, color: colors.status.warning, marginTop: spacing.sm },
  error: { ...typography.caption, color: colors.status.danger, marginTop: spacing.md },

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
