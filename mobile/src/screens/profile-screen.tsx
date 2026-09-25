import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { useAuth } from '../auth/auth-context';
import { useUnreadCount } from '../api/use-notifications';
import { appConfig } from '../config/env';
import { Button, Card, Divider, EmptyState } from '../components/ui';
import { LanguagePicker } from '../components/language-picker';
import { formatDate } from '../lib/format';
import { colors, layout, spacing, typography } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Navigation = NativeStackNavigationProp<RootStackParamList>;

export function ProfileScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<Navigation>();
  const insets = useSafeAreaInsets();
  const { user, isAuthenticated, logout } = useAuth();
  const unreadCount = useUnreadCount(isAuthenticated);

  const confirmLogout = () => {
    Alert.alert(t('profile.logoutTitle'), t('profile.logoutConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('profile.logout'), style: 'destructive', onPress: () => void logout() },
    ]);
  };

  if (!isAuthenticated || !user) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <EmptyState
          title={t('profile.yourProfile')}
          message={t('profile.loginPrompt')}
          action={
            <View style={styles.authActions}>
              <Button label={t('profile.signIn')} onPress={() => navigation.navigate('Login')} />
              <Button
                label={t('screens.register')}
                variant="secondary"
                onPress={() => navigation.navigate('Register')}
              />
            </View>
          }
        />

        {/*
          Le choix de la langue est offert **avant** la connexion.
          Le placer derrière un compte obligerait quelqu'un qui ne lit pas le
          français à s'inscrire dans une langue qu'il ne comprend pas pour
          pouvoir en changer.
        */}
        <View style={styles.languageBlock}>
          <Text style={styles.sectionTitle}>{t('language.title')}</Text>
          <LanguagePicker />
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xxl },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.heading}>{t('tabs.profile')}</Text>

      <Card style={styles.identityCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarInitials}>{initials(user.fullName)}</Text>
        </View>
        <View style={styles.identityText}>
          <Text style={styles.name}>{user.fullName}</Text>
          <Text style={styles.email}>{user.email}</Text>
        </View>
      </Card>

      <Card style={styles.card}>
        <Row label={t('profile.memberSince')} value={formatDate(user.createdAt)} />
        {user.phone ? (
          <>
            <Divider />
            <Row label={t('profile.phone')} value={user.phone} />
          </>
        ) : null}
      </Card>

      <Text style={styles.sectionTitle}>{t('profile.myAccount')}</Text>
      <Card style={styles.card}>
        <ActionRow
          label={t('profile.editProfile')}
          onPress={() => navigation.navigate('EditProfile')}
        />
        <Divider />
        <ActionRow
          label={t('profile.changePassword')}
          onPress={() => navigation.navigate('ChangePassword')}
        />
      </Card>

      <Text style={styles.sectionTitle}>{t('profile.myContent')}</Text>
      <Card style={styles.card}>
        <ActionRow
          label={t('screens.notifications')}
          onPress={() => navigation.navigate('Notifications')}
          badge={unreadCount > 0 ? String(unreadCount) : undefined}
        />
        <Divider />
        <ActionRow
          label={t('screens.favorites')}
          onPress={() => navigation.navigate('Favorites')}
        />
      </Card>

      <Button
        label={t('profile.logout')}
        variant="secondary"
        onPress={confirmLogout}
        style={styles.logout}
      />

      <Text style={styles.sectionTitle}>{t('language.title')}</Text>
      <LanguagePicker />

      <Text style={styles.version}>Tourism Platform · {appConfig.appEnv}</Text>
    </ScrollView>
  );
}

/** Entrée cliquable menant à un écran de gestion du compte. */
function ActionRow({
  label,
  onPress,
  badge,
}: {
  label: string;
  onPress: () => void;
  badge?: string | undefined;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={badge ? `${label}, ${badge} non lues` : label}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <Text style={styles.rowValue}>{label}</Text>
      <View style={styles.rowRight}>
        {badge ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        ) : null}
        <Text style={styles.chevron}>›</Text>
      </View>
    </Pressable>
  );
}

function Row({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, muted && styles.rowMuted]}>{label}</Text>
      <Text style={[styles.rowValue, muted && styles.rowMuted]}>{value}</Text>
    </View>
  );
}

/** « Fatimetou Sidi » → « FS ». Le prénom seul suffit si le nom est unique. */
function initials(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.slice(0, 1).toUpperCase())
    .join('');
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.subtle },
  /*
   * La marge latérale manquait : le bloc de langue, en largeur pleine, venait
   * toucher les deux bords — le titre se retrouvait collé au cadre, et la
   * rangée des trois langues débordait de l'écran.
   */
  centered: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: layout.screenPadding,
    backgroundColor: colors.surface.subtle,
  },
  content: { paddingHorizontal: spacing.lg, gap: spacing.md },

  heading: { ...typography.h1, color: colors.text.primary, marginBottom: spacing.xs },

  identityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    padding: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.surface.border,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.brand[600],
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: { ...typography.h3, color: colors.text.inverse },
  identityText: { flex: 1, gap: 2 },
  name: { ...typography.h3, color: colors.text.primary },
  email: { ...typography.caption, color: colors.text.secondary },

  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.surface.border,
  },
  // Bloc de langue de l'écran déconnecté : il vient sous l'invitation à se
  // connecter, séparé d'elle pour ne pas se lire comme une de ses actions.
  // `alignSelf: 'stretch'` plutôt que `width: '100%'` : dans un conteneur
  // centré, la largeur pleine se mesure sur le parent sans tenir compte de sa
  // marge, et l'élément ressort donc de chaque côté.
  languageBlock: { alignSelf: 'stretch', marginTop: spacing.xxl },
  sectionTitle: { ...typography.h3, color: colors.text.primary, marginTop: spacing.md },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  rowLabel: { ...typography.body, color: colors.text.secondary },
  rowValue: { ...typography.body, color: colors.text.primary, fontWeight: '500' },
  rowMuted: { color: colors.text.muted },
  rowPressed: { opacity: 0.6 },
  chevron: { fontSize: 22, color: colors.text.muted, lineHeight: 24 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  badge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: colors.brand[600],
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { ...typography.caption, color: colors.text.inverse, fontWeight: '700', fontSize: 12 },

  authActions: { gap: spacing.sm, minWidth: 220 },
  logout: { marginTop: spacing.lg },
  version: { ...typography.caption, color: colors.text.muted, textAlign: 'center' },
});
