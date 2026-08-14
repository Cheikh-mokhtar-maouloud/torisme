import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PlaceType } from '@tourism/shared/constants';
import type { MapMarker } from '@tourism/shared/types';

import { formatMoney } from '../lib/format';
import { colors, layout, radius, spacing, typography } from '../theme';
import { Icon } from './icon';
import { PlaceImage } from './place-image';
import { Rating } from './ui';

/** Couleur par type : le repère visuel principal sur une carte dense. */
export const MARKER_COLORS: Record<PlaceType, string> = {
  [PlaceType.HOTEL]: colors.brand[600],
  [PlaceType.RESTAURANT]: '#d97706',
  [PlaceType.ATTRACTION]: '#7c3aed',
  [PlaceType.EXCURSION]: colors.sand[500],
};

export const TYPE_LABELS: Record<PlaceType, string> = {
  [PlaceType.HOTEL]: 'Hôtels',
  [PlaceType.RESTAURANT]: 'Restaurants',
  [PlaceType.ATTRACTION]: 'Sites',
  [PlaceType.EXCURSION]: 'Excursions',
};

const PRICE_SUFFIX: Record<PlaceType, string> = {
  [PlaceType.HOTEL]: ' / nuit',
  [PlaceType.RESTAURANT]: '',
  [PlaceType.ATTRACTION]: ' / entrée',
  [PlaceType.EXCURSION]: ' / place',
};

/**
 * Mini-fiche affichée sous la carte quand un marqueur est sélectionné.
 *
 * Elle flotte au-dessus de la carte plutôt que de la remplacer : l'utilisateur
 * garde le contexte géographique et peut passer d'un marqueur à l'autre sans
 * revenir en arrière.
 */
export function MapMarkerCard({
  marker,
  onPress,
  onClose,
  onLayout,
  onRoute,
  routeSummary,
  isRouting = false,
}: {
  marker: MapMarker;
  onPress: () => void;
  onClose: () => void;
  /**
   * Remonte la hauteur réellement occupée.
   *
   * L'écran s'en sert pour placer le bouton de localisation juste au-dessus.
   * Une valeur en dur y supposerait une hauteur fixe, que le contenu dément dès
   * qu'un nom de lieu passe sur deux lignes ou que l'utilisateur agrandit la
   * taille du texte dans les réglages du système.
   */
  onLayout?: (height: number) => void;
  /**
   * Demande d'itinéraire. Absent, l'action n'est pas proposée — c'est le cas
   * tant que la position de l'utilisateur est inconnue : un itinéraire sans
   * point de départ n'a pas de sens, et un bouton qui explique qu'il ne peut
   * rien faire vaut moins qu'un bouton absent.
   */
  onRoute?: (() => void) | undefined;
  /** Résumé de l'itinéraire calculé, affiché à la place de l'action. */
  routeSummary?: string | undefined;
  isRouting?: boolean;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View
      // La zone sûre du bas est ajoutée à la marge : sans elle, la fiche passe
      // sous la barre de navigation gestuelle ou sous la barre d'onglets.
      style={[styles.container, { bottom: insets.bottom + spacing.lg }]}
      onLayout={(event) => onLayout?.(event.nativeEvent.layout.height)}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Ouvrir la fiche de ${marker.name}`}
        onPress={onPress}
        style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      >
        <View style={styles.thumb}>
          <PlaceImage
            images={marker.imageUrl ? [{ url: marker.imageUrl, order: 0 }] : []}
            name={marker.name}
            rounded={false}
          />
        </View>

        <View style={styles.body}>
          <View style={styles.typeRow}>
            <View style={[styles.typeDot, { backgroundColor: MARKER_COLORS[marker.type] }]} />
            <Text style={styles.typeLabel}>{TYPE_LABELS[marker.type]}</Text>
            {marker.distanceMeters !== undefined ? (
              <Text style={styles.distance}>· {formatDistance(marker.distanceMeters)}</Text>
            ) : null}
          </View>

          <Text style={styles.name} numberOfLines={1}>
            {marker.name}
          </Text>
          <Text style={styles.city} numberOfLines={1}>
            {marker.city}
          </Text>

          <View style={styles.footer}>
            <Rating value={marker.rating} count={marker.reviewCount} />
            {marker.price ? (
              <Text style={styles.price}>
                {formatMoney(marker.price, marker.currency ?? 'MRU')}
                <Text style={styles.priceUnit}>{PRICE_SUFFIX[marker.type]}</Text>
              </Text>
            ) : null}
          </View>
        </View>
      </Pressable>

      {/*
        L'action d'itinéraire est **hors** de la zone cliquable de la fiche.
        Imbriquée dedans, l'appui déclencherait aussi l'ouverture du lieu :
        l'utilisateur demanderait un trajet et se retrouverait sur une autre
        page.
      */}
      {onRoute || routeSummary ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Itinéraire vers ${marker.name}`}
          onPress={onRoute}
          disabled={!onRoute || isRouting}
          style={({ pressed }) => [styles.routeBar, pressed && styles.pressed]}
        >
          {isRouting ? (
            <ActivityIndicator size="small" color={colors.brand[700]} />
          ) : (
            <Icon name="excursion" size={16} color={colors.brand[700]} />
          )}
          <Text style={styles.routeLabel}>
            {isRouting ? 'Calcul de l’itinéraire…' : (routeSummary ?? 'Itinéraire')}
          </Text>
        </Pressable>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Fermer"
        onPress={onClose}
        hitSlop={10}
        style={styles.close}
      >
        <Icon name="close" size={16} color={colors.text.secondary} />
      </Pressable>
    </View>
  );
}

/** Sous le kilomètre, l'utilisateur raisonne en mètres ; au-delà, en kilomètres. */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${meters} m`;
  return `${(meters / 1000).toFixed(meters < 10_000 ? 1 : 0)} km`;
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: layout.screenPadding,
    right: layout.screenPadding,
  },
  card: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.surface.background,
    borderRadius: radius.lg,
    padding: spacing.sm,
    // Ombre portée : la fiche doit se détacher nettement de la carte, dont les
    // couleurs et le contraste sont imprévisibles.
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  pressed: { opacity: 0.9 },

  /*
   * Barre d'itinéraire, posée sous la fiche et rattachée à elle par un coin
   * supérieur droit : elle se lit comme un prolongement, non comme un second
   * élément flottant.
   */
  routeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface.background,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  routeLabel: { ...typography.caption, color: colors.brand[700], fontWeight: '700' },

  thumb: { width: 92, height: 92, borderRadius: radius.md, overflow: 'hidden' },
  body: { flex: 1, gap: 1, paddingVertical: 2, paddingRight: spacing.lg },

  typeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  typeDot: { width: 8, height: 8, borderRadius: 4 },
  typeLabel: { ...typography.caption, color: colors.text.secondary, fontSize: 12 },
  distance: { ...typography.caption, color: colors.text.muted, fontSize: 12 },

  name: { ...typography.body, fontWeight: '700', color: colors.text.primary },
  city: { ...typography.caption, color: colors.text.secondary },

  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  price: { ...typography.caption, color: colors.text.primary, fontWeight: '700' },
  priceUnit: { color: colors.text.muted, fontWeight: '400' },

  close: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeLabel: { fontSize: 20, color: colors.text.muted, lineHeight: 22 },
});
