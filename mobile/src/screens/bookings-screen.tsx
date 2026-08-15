import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BookingStatus } from '@tourism/shared/constants';
import type { Booking, ExcursionBooking } from '@tourism/shared/types';

import { useBookings, useExcursionBookings } from '../api/queries';
import { useAuth } from '../auth/auth-context';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Card, EmptyState, ErrorState, Skeleton } from '../components/ui';
import { PressableScale } from '../components/motion';
import {
  formatDate,
  formatGuests,
  formatMoney,
  formatNights,
  formatShortDate,
  formatSeats,
} from '../lib/format';
import { accent, colors, radius, spacing, typography } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Navigation = NativeStackNavigationProp<RootStackParamList>;

export const STATUS_LABELS: Record<
  string,
  { label: string; tone: 'neutral' | 'success' | 'warning' | 'danger' }
> = {
  [BookingStatus.PENDING]: { label: 'bookings.pending', tone: 'warning' },
  [BookingStatus.CONFIRMED]: { label: 'bookings.confirmed', tone: 'success' },
  [BookingStatus.CANCELLED]: { label: 'bookings.cancelled', tone: 'danger' },
  [BookingStatus.COMPLETED]: { label: 'bookings.completed', tone: 'neutral' },
};

export function BookingsScreen() {
  const { t } = useTranslation();
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
      <Text style={styles.heading}>{t('bookings.title')}</Text>

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
              title={t('bookings.empty')}
              message={t('bookings.emptyMessage')}
              action={
                <Button
                  label={t('bookings.exploreHotels')}
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
  const { t } = useTranslation();
  const status = STATUS_LABELS[booking.status] ?? {
    label: booking.status,
    tone: 'neutral' as const,
  };

  /*
   * Le nom de l'hôtel fait le titre, la référence passe en second.
   *
   * L'inverse était affiché jusqu'ici : « TP-9LAXWA » en gros, sans mention de
   * l'établissement. Or personne ne retient sa référence — on retient où l'on
   * dort. La référence garde son utilité au guichet et au téléphone, mais elle
   * ne mérite pas la première ligne.
   *
   * Le repli sur la référence n'est pas décoratif : un hôtel supprimé de la
   * base laisse une réservation sans nom, qui doit rester identifiable.
   */
  const title = booking.hotelName ?? booking.reference;

  return (
    <PressableScale
      accessibilityLabel={`${title}, ${t(status.label)}`}
      onPress={onPress}
      scaleTo={0.98}
    >
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.titleBlock}>
            <View style={styles.kindRow}>
              <View style={[styles.kindDot, { backgroundColor: accent.hotel.base }]} />
              <Text style={styles.kindTag}>{t('types.hotel')}</Text>
            </View>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
          </View>
          <Badge label={t(status.label)} tone={status.tone} />
        </View>

        {booking.roomName ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {booking.roomName}
          </Text>
        ) : null}

        <Text style={styles.dates}>
          {formatShortDate(booking.checkIn)} → {formatShortDate(booking.checkOut)} ·{' '}
          {formatNights(booking.nights)} · {formatGuests(booking.guests)}
        </Text>

        <View style={styles.footer}>
          <Text style={styles.total}>{formatMoney(booking.totalPrice, booking.currency)}</Text>
          {/* La référence reste lisible, mais discrète : elle ne sert qu'au guichet. */}
          <Text style={styles.reference}>{booking.reference}</Text>
        </View>
      </Card>
    </PressableScale>
  );
}

function ExcursionBookingRow({
  booking,
  onPress,
}: {
  booking: ExcursionBooking;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const status = STATUS_LABELS[booking.status] ?? {
    label: booking.status,
    tone: 'neutral' as const,
  };

  const title = booking.excursionTitle ?? booking.reference;

  return (
    <PressableScale
      accessibilityLabel={`${title}, ${t(status.label)}`}
      onPress={onPress}
      scaleTo={0.98}
    >
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.titleBlock}>
            <View style={styles.kindRow}>
              <View style={[styles.kindDot, { backgroundColor: accent.excursion.base }]} />
              <Text style={styles.kindTag}>{t('types.excursion')}</Text>
            </View>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
          </View>
          <Badge label={t(status.label)} tone={status.tone} />
        </View>

        {booking.destination ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {booking.destination}
          </Text>
        ) : null}

        {/*
          La date de **départ** prime sur la date de demande.
          C'est celle que le voyageur cherche : « quand est-ce que je pars ? »,
          non « quand ai-je réservé ? ». La seconde ne sert qu'en cas de litige,
          et la fiche de détail la porte déjà.
        */}
        <Text style={styles.dates}>
          {booking.startsAt ? formatDate(booking.startsAt) : formatDate(booking.createdAt)} ·{' '}
          {formatSeats(booking.seats)}
        </Text>

        <View style={styles.footer}>
          <Text style={styles.total}>{formatMoney(booking.totalPrice, booking.currency)}</Text>
          <Text style={styles.reference}>{booking.reference}</Text>
        </View>
      </Card>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.subtle },
  centered: { flex: 1, justifyContent: 'center', backgroundColor: colors.surface.subtle },

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
  /*
   * `alignItems: 'flex-start'` et non `'center'` : le bloc de titre fait deux
   * lignes, la pastille d'état une seule. Centrées l'une sur l'autre, la
   * pastille flottait au milieu du titre ; alignées en haut, elles partagent la
   * même ligne de base visuelle.
   */
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  // `flex: 1` : sans lui, un nom long pousserait la pastille d'état hors de la
  // fiche au lieu de se laisser tronquer.
  titleBlock: { flex: 1, gap: 2 },
  title: { ...typography.h3, color: colors.text.primary },

  kindRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  // La pastille de couleur reprend celle de la catégorie sur la carte et sur
  // l'accueil : une réservation d'excursion se reconnaît au même rose.
  kindDot: { width: 6, height: 6, borderRadius: radius.full },
  kindTag: { ...typography.overline, fontSize: 10, color: colors.text.muted },

  subtitle: { ...typography.caption, color: colors.text.secondary },
  dates: { ...typography.caption, color: colors.text.secondary },

  footer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  total: { ...typography.h3, color: colors.text.primary },
  // La référence descend en pied de fiche, en gris clair : elle ne sert qu'au
  // guichet et n'a plus à disputer la première ligne au nom du lieu.
  reference: { ...typography.caption, fontSize: 11, color: colors.text.muted },

  actionButton: { minWidth: 200 },
});
