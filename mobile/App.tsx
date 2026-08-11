import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { DEFAULT_CURRENCY, SUPPORTED_COUNTRIES } from '@tourism/shared/constants';

import { appConfig } from './src/config/env';
import { colors, radius, spacing, typography } from './src/theme';

/**
 * Écran provisoire de Phase 1.
 *
 * Il vérifie trois choses en une seule vue : la résolution du paquet partagé
 * par Metro, la lecture de la configuration Expo, et les jetons de design.
 * Remplacé par la navigation réelle en Phase 5.
 */
export default function App() {
  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="dark" />
      <View style={styles.content}>
        <Text style={styles.eyebrow}>PHASE 1</Text>
        <Text style={styles.title}>Tourism Platform</Text>
        <Text style={styles.subtitle}>
          Fondation en place. La navigation et les écrans arrivent en Phase 5.
        </Text>

        <View style={styles.card}>
          <Row label="API" value={appConfig.apiUrl} />
          <Row label="Environnement" value={appConfig.appEnv} />
          <Row label="Devise" value={DEFAULT_CURRENCY} />
          <Row label="Pays" value={SUPPORTED_COUNTRIES.map((country) => country.name).join(', ')} />
        </View>
      </View>
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.surface.subtle,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  eyebrow: {
    ...typography.caption,
    color: colors.brand[700],
    letterSpacing: 1.5,
    fontWeight: '600',
  },
  title: {
    ...typography.h1,
    color: colors.text.primary,
  },
  subtitle: {
    ...typography.body,
    color: colors.text.secondary,
    marginBottom: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface.background,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.surface.border,
    paddingHorizontal: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.lg,
    paddingVertical: spacing.md,
  },
  rowLabel: {
    ...typography.caption,
    color: colors.text.muted,
  },
  rowValue: {
    ...typography.caption,
    color: colors.text.primary,
    flexShrink: 1,
    textAlign: 'right',
  },
});
