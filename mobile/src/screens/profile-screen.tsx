import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../auth/auth-context';
import { appConfig } from '../config/env';
import { Button, Card, Divider, EmptyState } from '../components/ui';
import { formatDate } from '../lib/format';
import { colors, spacing, typography } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Navigation = NativeStackNavigationProp<RootStackParamList>;

export function ProfileScreen() {
  const navigation = useNavigation<Navigation>();
  const insets = useSafeAreaInsets();
  const { user, isAuthenticated, logout } = useAuth();

  const confirmLogout = () => {
    Alert.alert('Déconnexion', 'Voulez-vous vous déconnecter ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Se déconnecter', style: 'destructive', onPress: () => void logout() },
    ]);
  };

  if (!isAuthenticated || !user) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <EmptyState
          title="Votre profil"
          message="Connectez-vous pour gérer votre compte et vos réservations."
          action={
            <View style={styles.authActions}>
              <Button label="Se connecter" onPress={() => navigation.navigate('Login')} />
              <Button
                label="Créer un compte"
                variant="secondary"
                onPress={() => navigation.navigate('Register')}
              />
            </View>
          }
        />
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
      <Text style={styles.heading}>Profil</Text>

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
        <Row label="Membre depuis" value={formatDate(user.createdAt)} />
        {user.phone ? (
          <>
            <Divider />
            <Row label="Téléphone" value={user.phone} />
          </>
        ) : null}
      </Card>

      <Text style={styles.sectionTitle}>À venir</Text>
      <Card style={styles.card}>
        <Row label="Favoris" value="Phase 10" muted />
        <Divider />
        <Row label="Mes avis" value="Phase 10" muted />
        <Divider />
        <Row label="Notifications" value="Phase 11" muted />
        <Divider />
        <Row label="Modifier le profil" value="Phase 8" muted />
      </Card>

      <Button
        label="Se déconnecter"
        variant="secondary"
        onPress={confirmLogout}
        style={styles.logout}
      />

      <Text style={styles.version}>Tourism Platform · {appConfig.appEnv}</Text>
    </ScrollView>
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
  centered: { flex: 1, justifyContent: 'center', backgroundColor: colors.surface.subtle },
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

  authActions: { gap: spacing.sm, minWidth: 220 },
  logout: { marginTop: spacing.lg },
  version: { ...typography.caption, color: colors.text.muted, textAlign: 'center' },
});
