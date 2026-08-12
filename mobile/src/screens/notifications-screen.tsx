import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NotificationType } from '@tourism/shared/constants';
import type { Notification } from '@tourism/shared/types';

import {
  useMarkAllRead,
  useMarkNotificationRead,
  useNotifications,
} from '../api/use-notifications';
import { useAuth } from '../auth/auth-context';
import { Button, Card, EmptyState, ErrorState, Skeleton } from '../components/ui';
import { formatDateTime } from '../lib/format';
import { colors, spacing, typography } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Navigation = NativeStackNavigationProp<RootStackParamList>;

/** Pictogramme par type — repère visuel plus rapide à lire qu'un libellé. */
const ICONS: Record<string, string> = {
  [NotificationType.BOOKING_CONFIRMED]: '✓',
  [NotificationType.BOOKING_CANCELLED]: '✕',
  [NotificationType.BOOKING_REMINDER]: '⏰',
  [NotificationType.EXCURSION_UPDATED]: '↻',
  [NotificationType.EXCURSION_REMINDER]: '⏰',
  [NotificationType.REVIEW_MODERATED]: '★',
  [NotificationType.SYSTEM]: 'i',
};

export function NotificationsScreen() {
  const navigation = useNavigation<Navigation>();
  const insets = useSafeAreaInsets();
  const { isAuthenticated } = useAuth();

  const notifications = useNotifications(isAuthenticated);
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllRead();

  if (!isAuthenticated) {
    return (
      <View style={styles.centered}>
        <EmptyState
          title="Vos notifications"
          message="Connectez-vous pour suivre vos réservations et nos messages."
          action={
            <Button
              label="Se connecter"
              onPress={() => navigation.navigate('Login')}
              style={styles.wideButton}
            />
          }
        />
      </View>
    );
  }

  if (notifications.error) {
    return (
      <ErrorState
        message={
          notifications.error instanceof Error
            ? notifications.error.message
            : 'Chargement impossible.'
        }
        onRetry={() => void notifications.refetch()}
      />
    );
  }

  if (notifications.isLoading) {
    return (
      <View style={styles.list}>
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} height={76} />
        ))}
      </View>
    );
  }

  const items = notifications.data?.items ?? [];
  const unreadCount = notifications.data?.unreadCount ?? 0;

  return (
    <View style={styles.screen}>
      {unreadCount > 0 ? (
        <View style={styles.header}>
          <Text style={styles.headerText}>
            {unreadCount} non lue{unreadCount > 1 ? 's' : ''}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => markAllRead.mutate()}
            disabled={markAllRead.isPending}
            hitSlop={8}
          >
            <Text style={styles.headerAction}>Tout marquer comme lu</Text>
          </Pressable>
        </View>
      ) : null}

      <FlatList
        data={items}
        keyExtractor={(notification) => notification.id}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xxl }]}
        showsVerticalScrollIndicator={false}
        refreshing={notifications.isRefetching}
        onRefresh={() => void notifications.refetch()}
        renderItem={({ item }) => (
          <NotificationRow
            notification={item}
            onPress={() => {
              if (!item.readAt) markRead.mutate(item.id);
              openTarget(navigation, item);
            }}
          />
        )}
        ListEmptyComponent={
          <EmptyState
            title="Aucune notification"
            message="Vous serez prévenu ici du suivi de vos réservations."
          />
        }
      />
    </View>
  );
}

function NotificationRow({
  notification,
  onPress,
}: {
  notification: Notification;
  onPress: () => void;
}) {
  const isUnread = !notification.readAt;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${notification.title}. ${notification.body}`}
      onPress={onPress}
      style={({ pressed }) => [pressed && styles.pressed]}
    >
      <Card style={[styles.card, isUnread && styles.cardUnread]}>
        <View style={[styles.icon, isUnread && styles.iconUnread]}>
          <Text style={[styles.iconText, isUnread && styles.iconTextUnread]}>
            {ICONS[notification.type] ?? 'i'}
          </Text>
        </View>

        <View style={styles.body}>
          <Text style={[styles.title, isUnread && styles.titleUnread]} numberOfLines={1}>
            {notification.title}
          </Text>
          <Text style={styles.message} numberOfLines={2}>
            {notification.body}
          </Text>
          <Text style={styles.date}>{formatDateTime(notification.createdAt)}</Text>
        </View>

        {isUnread ? <View style={styles.dot} /> : null}
      </Card>
    </Pressable>
  );
}

/**
 * Ouvre la fiche visée par la notification.
 *
 * La charge utile ne contient que des identifiants : chaque type de contenu sait
 * quel écran ouvrir. Une notification sans cible reste simplement informative.
 */
function openTarget(navigation: Navigation, notification: Notification): void {
  const data = notification.data ?? {};

  if (data.bookingId) {
    navigation.navigate('BookingDetail', { bookingId: data.bookingId });
    return;
  }

  if (data.excursionBookingId) {
    navigation.navigate('ExcursionBookingDetail', { bookingId: data.excursionBookingId });
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.subtle },
  centered: { flex: 1, justifyContent: 'center', backgroundColor: colors.surface.subtle },
  pressed: { opacity: 0.85 },
  wideButton: { minWidth: 200 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.surface.border,
  },
  headerText: { ...typography.caption, color: colors.text.secondary, fontWeight: '600' },
  headerAction: { ...typography.caption, color: colors.brand[700], fontWeight: '600' },

  list: { padding: spacing.lg, gap: spacing.sm, flexGrow: 1 },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.surface.border,
  },
  cardUnread: { borderColor: colors.brand[300], backgroundColor: colors.brand[50] },

  icon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface.subtle,
  },
  iconUnread: { backgroundColor: colors.brand[600] },
  iconText: { ...typography.body, color: colors.text.secondary, fontWeight: '700' },
  iconTextUnread: { color: colors.text.inverse },

  body: { flex: 1, gap: 2 },
  title: { ...typography.body, color: colors.text.primary },
  titleUnread: { fontWeight: '700' },
  message: { ...typography.caption, color: colors.text.secondary, lineHeight: 18 },
  date: { ...typography.caption, color: colors.text.muted, fontSize: 11, marginTop: 2 },

  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.brand[600],
    marginTop: spacing.xs,
  },
});
