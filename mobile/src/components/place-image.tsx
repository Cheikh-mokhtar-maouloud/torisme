import { Image, type ImageStyle } from 'expo-image';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import type { ImageRef } from '@tourism/shared/types';

import { colors, radius, typography } from '../theme';

/**
 * Image d'un lieu, avec repli lorsqu'aucune photo n'est renseignée.
 *
 * Le repli n'est pas décoratif : tant que le téléversement n'existe pas
 * (Phase 7), beaucoup de fiches n'ont aucune image. Afficher un cadre vide
 * donnerait l'impression d'un chargement bloqué ; on montre donc explicitement
 * qu'il n'y a pas de photo.
 */
export function PlaceImage({
  images,
  name,
  style,
  rounded = true,
}: {
  images: ImageRef[];
  name: string;
  /**
   * Styles de disposition (dimensions, rayon). Ils sont communs à `ViewStyle`
   * et `ImageStyle` ; la conversion à l'usage est donc sans risque, les deux
   * branches du composant rendant l'une une `View`, l'autre une `Image`.
   */
  style?: StyleProp<ViewStyle>;
  rounded?: boolean;
}) {
  // L'image principale est celle d'ordre le plus faible, pas forcément la
  // première du tableau : le dashboard permettra de les réordonner.
  const cover = [...images].sort((a, b) => a.order - b.order)[0];

  if (!cover) {
    return (
      <View style={[styles.fallback, rounded && styles.rounded, style]}>
        <Text style={styles.fallbackInitial}>{name.slice(0, 1).toUpperCase()}</Text>
        <Text style={styles.fallbackLabel}>Photo à venir</Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri: cover.url }}
      // `expo-image` met en cache disque et mémoire : le retour sur une liste
      // déjà vue ne relance pas le téléchargement.
      cachePolicy="memory-disk"
      contentFit="cover"
      transition={200}
      accessibilityLabel={cover.alt ?? name}
      style={[styles.image, rounded && styles.rounded, style as StyleProp<ImageStyle>]}
    />
  );
}

const styles = StyleSheet.create({
  image: { width: '100%', height: '100%', backgroundColor: colors.surface.subtle },
  rounded: { borderRadius: radius.md },
  fallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand[50],
    gap: 2,
  },
  fallbackInitial: {
    ...typography.h1,
    color: colors.brand[300],
    fontWeight: '700',
  },
  fallbackLabel: { ...typography.caption, color: colors.brand[600], fontSize: 11 },
});
