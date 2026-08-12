import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { colors, radius, spacing, typography } from '../theme';

/* -------------------------------------------------------------------------- */
/* Boutons                                                                     */
/* -------------------------------------------------------------------------- */

type ButtonVariant = 'primary' | 'secondary' | 'ghost';

export function Button({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const isInactive = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isInactive, busy: loading }}
      onPress={onPress}
      disabled={isInactive}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && styles.buttonPrimary,
        variant === 'secondary' && styles.buttonSecondary,
        variant === 'ghost' && styles.buttonGhost,
        // Retour tactile immédiat : sur mobile, l'absence de survol rend le
        // pressed-state indispensable pour confirmer que l'appui a été pris.
        pressed && !isInactive && styles.buttonPressed,
        isInactive && styles.buttonDisabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'primary' ? colors.text.inverse : colors.brand[700]}
          size="small"
        />
      ) : (
        <Text
          style={[
            styles.buttonLabel,
            variant === 'primary' ? styles.buttonLabelPrimary : styles.buttonLabelDark,
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

/* -------------------------------------------------------------------------- */
/* Saisie                                                                      */
/* -------------------------------------------------------------------------- */

export function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string | undefined;
  children: ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

export function Input({ invalid, style, ...props }: TextInputProps & { invalid?: boolean }) {
  return (
    <TextInput
      placeholderTextColor={colors.text.muted}
      style={[styles.input, invalid && styles.inputInvalid, style]}
      {...props}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Affichage                                                                   */
/* -------------------------------------------------------------------------- */

export function Card({
  children,
  style,
}: {
  children: ReactNode;
  // `StyleProp` plutôt que `ViewStyle` : les appelants composent souvent
  // plusieurs styles conditionnels, ce qu'un objet seul n'accepte pas.
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Chip({
  label,
  selected = false,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
}) {
  const content = (
    <View style={[styles.chip, selected && styles.chipSelected]}>
      <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>{label}</Text>
    </View>
  );

  if (!onPress) return content;

  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress}>
      {content}
    </Pressable>
  );
}

export function Rating({ value, count }: { value: number; count: number }) {
  if (count === 0) {
    return <Text style={styles.ratingEmpty}>Pas encore d’avis</Text>;
  }

  return (
    <View style={styles.ratingRow}>
      <Text style={styles.ratingStar}>★</Text>
      <Text style={styles.ratingValue}>{value.toFixed(1)}</Text>
      <Text style={styles.ratingCount}>({count})</Text>
    </View>
  );
}

/**
 * Message d'erreur avec action de reprise.
 *
 * Toujours accompagné d'un bouton « Réessayer » : sur mobile, une erreur réseau
 * est le plus souvent transitoire, et laisser l'utilisateur sans issue autre que
 * la fermeture de l'application est un échec d'interface.
 */
export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: (() => void) | undefined;
}) {
  return (
    <View style={styles.stateContainer}>
      <Text style={styles.stateTitle}>Une erreur est survenue</Text>
      <Text style={styles.stateMessage}>{message}</Text>
      {onRetry ? (
        <Button
          label="Réessayer"
          onPress={onRetry}
          variant="secondary"
          style={styles.stateAction}
        />
      ) : null}
    </View>
  );
}

export function EmptyState({
  title,
  message,
  action,
}: {
  title: string;
  message?: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.stateContainer}>
      <Text style={styles.stateTitle}>{title}</Text>
      {message ? <Text style={styles.stateMessage}>{message}</Text> : null}
      {action ? <View style={styles.stateAction}>{action}</View> : null}
    </View>
  );
}

/**
 * Bloc de chargement.
 *
 * Un squelette aux dimensions du contenu attendu, plutôt qu'un indicateur
 * centré : la mise en page ne saute pas à l'arrivée des données, et l'attente
 * paraît plus courte parce que la structure est déjà lisible.
 */
export function Skeleton({
  height,
  width,
  style,
}: {
  height: number;
  width?: number | string;
  style?: ViewStyle;
}) {
  return (
    <View
      style={[
        styles.skeleton,
        { height, ...(width === undefined ? {} : { width: width as ViewStyle['width'] }) },
        style,
      ]}
    />
  );
}

export function Badge({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
}) {
  return (
    <View style={[styles.badge, styles[`badge_${tone}`]]}>
      <Text style={[styles.badgeLabel, styles[`badgeLabel_${tone}`]]}>{label}</Text>
    </View>
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  buttonPrimary: { backgroundColor: colors.brand[600] },
  buttonSecondary: {
    backgroundColor: colors.surface.background,
    borderWidth: 1,
    borderColor: colors.surface.border,
  },
  buttonGhost: { backgroundColor: 'transparent' },
  buttonPressed: { opacity: 0.75 },
  buttonDisabled: { opacity: 0.45 },
  buttonLabel: { ...typography.body, fontWeight: '600' },
  buttonLabelPrimary: { color: colors.text.inverse },
  buttonLabelDark: { color: colors.brand[700] },

  field: { gap: spacing.xs },
  fieldLabel: { ...typography.caption, color: colors.text.secondary, fontWeight: '600' },
  fieldError: { ...typography.caption, color: colors.status.danger },
  input: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.surface.border,
    backgroundColor: colors.surface.background,
    paddingHorizontal: spacing.md,
    ...typography.body,
    color: colors.text.primary,
  },
  inputInvalid: { borderColor: colors.status.danger },

  card: {
    backgroundColor: colors.surface.background,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },

  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.surface.subtle,
    borderWidth: 1,
    borderColor: colors.surface.border,
  },
  chipSelected: { backgroundColor: colors.brand[600], borderColor: colors.brand[600] },
  chipLabel: { ...typography.caption, color: colors.text.secondary, fontWeight: '500' },
  chipLabelSelected: { color: colors.text.inverse },

  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  ratingStar: { color: colors.sand[500], fontSize: 14 },
  ratingValue: { ...typography.caption, color: colors.text.primary, fontWeight: '600' },
  ratingCount: { ...typography.caption, color: colors.text.muted },
  ratingEmpty: { ...typography.caption, color: colors.text.muted },

  stateContainer: { alignItems: 'center', padding: spacing.xl, gap: spacing.sm },
  stateTitle: { ...typography.h3, color: colors.text.primary, textAlign: 'center' },
  stateMessage: { ...typography.body, color: colors.text.secondary, textAlign: 'center' },
  stateAction: { marginTop: spacing.md, minWidth: 180 },

  skeleton: { backgroundColor: colors.surface.border, borderRadius: radius.sm, opacity: 0.6 },

  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
    alignSelf: 'flex-start',
  },
  badge_neutral: { backgroundColor: colors.surface.subtle },
  badge_success: { backgroundColor: '#dcfce7' },
  badge_warning: { backgroundColor: '#fef3c7' },
  badge_danger: { backgroundColor: '#fee2e2' },
  badgeLabel: { ...typography.caption, fontWeight: '600', fontSize: 12 },
  badgeLabel_neutral: { color: colors.text.secondary },
  badgeLabel_success: { color: '#166534' },
  badgeLabel_warning: { color: '#92400e' },
  badgeLabel_danger: { color: '#991b1b' },

  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.surface.border },
});
