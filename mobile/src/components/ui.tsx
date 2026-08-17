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

import { useTranslation } from 'react-i18next';

import { colors, radius, spacing, typography } from '../theme';
import { Icon } from './icon';

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
  fill = false,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  /**
   * Partage la largeur disponible avec les autres pastilles de la rangée.
   *
   * `flexGrow` et non `flex` : `flex: 1` impose aussi une base nulle, si bien
   * que toutes les pastilles finiraient de la même largeur quel que soit leur
   * libellé — « Sites » aussi large que « Restaurants ». Ici chacune part de sa
   * largeur naturelle et ne se partage que l'espace restant.
   */
  fill?: boolean;
}) {
  const content = (
    <View style={[styles.chip, fill && styles.chipFill, selected && styles.chipSelected]}>
      <Text
        // Un libellé plus long que sa pastille doit être abrégé, jamais replié :
        // une deuxième ligne déformerait la rangée entière.
        numberOfLines={1}
        style={[
          styles.chipLabel,
          fill && styles.chipLabelFill,
          selected && styles.chipLabelSelected,
        ]}
      >
        {label}
      </Text>
    </View>
  );

  if (!onPress) return content;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={fill ? styles.chipPressableFill : undefined}
    >
      {content}
    </Pressable>
  );
}

export function Rating({ value, count }: { value: number; count: number }) {
  // Le hook est appelé avant la sortie anticipée : son ordre doit être le même
  // à chaque rendu, que la note existe ou non.
  const { t } = useTranslation();

  if (count === 0) {
    return <Text style={styles.ratingEmpty}>{t('common.noReviews')}</Text>;
  }

  return (
    <View style={styles.ratingRow}>
      {/*
        Étoile vectorielle et non le caractère « ★ ». Le glyphe dépend de la
        police du système : son dessin, sa graisse et sa position sur la ligne
        de base changent d'un téléphone à l'autre, et il ne s'aligne jamais
        proprement avec le chiffre qui le suit.
      */}
      <Icon name="star" size={13} color={colors.sand[500]} />
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
  const { t } = useTranslation();

  return (
    <View style={styles.stateContainer}>
      <Text style={styles.stateTitle}>{t('common.errorTitle')}</Text>
      <Text style={styles.stateMessage}>{message}</Text>
      {onRetry ? (
        <Button
          label={t('common.retry')}
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
  /*
   * Bouton : 52 points de haut.
   *
   * La recommandation d'accessibilité fixe 44 comme minimum absolu ; 52 donne
   * une cible confortable au pouce et, surtout, une présence visuelle qui
   * convient à une action principale. Un bouton de 48 dans une page aérée
   * paraît timide.
   */
  button: {
    minHeight: 52,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  buttonPrimary: { backgroundColor: colors.brand[600] },
  buttonSecondary: {
    // Fond plein plutôt que bordure : une bordure fine crée une ligne de plus
    // dans une page qui cherche justement à en avoir le moins possible.
    backgroundColor: colors.neutral[100],
  },
  buttonGhost: { backgroundColor: 'transparent' },
  buttonPressed: { opacity: 0.7 },
  buttonDisabled: { opacity: 0.4 },
  buttonLabel: { ...typography.bodyStrong, letterSpacing: 0.1 },
  buttonLabelPrimary: { color: colors.text.inverse },
  buttonLabelDark: { color: colors.text.primary },

  field: { gap: spacing.sm },
  fieldLabel: { ...typography.caption, color: colors.text.secondary, fontWeight: '600' },
  fieldError: { ...typography.caption, color: colors.status.danger },
  /*
   * Champ de saisie **sans bordure**, distingué par un fond gris très clair.
   *
   * La bordure de 1 point est le réflexe des interfaces d'il y a dix ans : elle
   * dessine un rectangle dur là où le regard n'a besoin que de repérer une
   * zone. Le fond suffit, et disparaît visuellement dès qu'on ne le cherche pas.
   */
  input: {
    minHeight: 52,
    borderRadius: radius.lg,
    borderWidth: 0,
    backgroundColor: colors.neutral[100],
    paddingHorizontal: spacing.lg,
    ...typography.body,
    color: colors.text.primary,
  },
  // L'erreur reste signalée par un trait : c'est le seul cas où la bordure
  // porte une information que la couleur de fond ne transmettrait pas assez.
  inputInvalid: { borderWidth: 1.5, borderColor: colors.status.danger },

  card: {
    backgroundColor: colors.surface.background,
    borderRadius: radius.xl,
    overflow: 'hidden',
  },

  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: radius.full,
    backgroundColor: colors.neutral[100],
  },
  // Sélection en gris très foncé plutôt qu'en couleur de marque : le teal reste
  // réservé aux actions, et le contraste noir/blanc se lit mieux qu'un teal sur
  // blanc à cette taille de texte.
  chipSelected: { backgroundColor: colors.neutral[900] },
  /*
   * En mode étiré, le rembourrage horizontal se réduit : c'est la largeur
   * partagée qui donne sa taille à la pastille, et un rembourrage généreux
   * n'ajouterait que du vide au détriment du texte.
   */
  chipFill: { paddingHorizontal: spacing.sm, alignItems: 'center' },
  chipPressableFill: { flexGrow: 1, flexBasis: 'auto' },
  chipLabelFill: { textAlign: 'center' },
  chipLabel: { ...typography.caption, color: colors.text.secondary, fontWeight: '600' },
  chipLabelSelected: { color: colors.text.inverse },

  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  ratingValue: { ...typography.caption, color: colors.text.primary, fontWeight: '700' },
  ratingCount: { ...typography.caption, color: colors.text.muted },
  ratingEmpty: { ...typography.caption, color: colors.text.muted },

  stateContainer: { alignItems: 'center', paddingVertical: spacing.xxxl, gap: spacing.sm },
  stateTitle: { ...typography.h3, color: colors.text.primary, textAlign: 'center' },
  stateMessage: {
    ...typography.body,
    color: colors.text.secondary,
    textAlign: 'center',
    maxWidth: 280,
  },
  stateAction: { marginTop: spacing.lg, minWidth: 200 },

  skeleton: { backgroundColor: colors.neutral[100], borderRadius: radius.md },

  badge: {
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radius.full,
    alignSelf: 'flex-start',
  },
  badge_neutral: { backgroundColor: colors.neutral[100] },
  badge_success: { backgroundColor: '#dcfce7' },
  badge_warning: { backgroundColor: '#fef3c7' },
  badge_danger: { backgroundColor: '#fee2e2' },
  badgeLabel: { fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: 0.2 },
  badgeLabel_neutral: { color: colors.text.secondary },
  badgeLabel_success: { color: '#166534' },
  badgeLabel_warning: { color: '#92400e' },
  badgeLabel_danger: { color: '#991b1b' },

  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.surface.border },
});
