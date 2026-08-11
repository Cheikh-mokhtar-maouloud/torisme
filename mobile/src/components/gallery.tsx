import { useState } from 'react';
import { Dimensions, FlatList, StyleSheet, Text, View } from 'react-native';

import type { ImageRef } from '@tourism/shared/types';

import { colors, radius, spacing, typography } from '../theme';
import { PlaceImage } from './place-image';

const SCREEN_WIDTH = Dimensions.get('window').width;

/**
 * Galerie photo à défilement paginé.
 *
 * Les images sont triées par `order` : la position 0 est la couverture choisie
 * dans le dashboard, et non simplement la première insérée.
 *
 * Une seule image ne justifie ni pagination ni compteur — on retombe alors sur
 * un affichage simple.
 */
export function Gallery({
  images,
  name,
  height = 260,
}: {
  images: ImageRef[];
  name: string;
  height?: number;
}) {
  const [index, setIndex] = useState(0);
  const sorted = [...images].sort((a, b) => a.order - b.order);

  if (sorted.length <= 1) {
    return (
      <View style={[styles.single, { height }]}>
        <PlaceImage images={sorted} name={name} rounded={false} />
      </View>
    );
  }

  return (
    <View style={{ height }}>
      <FlatList
        data={sorted}
        keyExtractor={(image, position) => image.providerId ?? `${image.url}-${position}`}
        horizontal
        // `pagingEnabled` cale le défilement sur la largeur de l'écran : chaque
        // geste avance exactement d'une image, sans position intermédiaire.
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(event) => {
          setIndex(Math.round(event.nativeEvent.contentOffset.x / SCREEN_WIDTH));
        }}
        // Sans cette indication, FlatList mesure chaque élément au rendu, ce qui
        // saccade le défilement d'images plein écran.
        getItemLayout={(_, position) => ({
          length: SCREEN_WIDTH,
          offset: SCREEN_WIDTH * position,
          index: position,
        })}
        renderItem={({ item }) => (
          <View style={{ width: SCREEN_WIDTH, height }}>
            <PlaceImage images={[item]} name={name} rounded={false} />
          </View>
        )}
      />

      <View style={styles.counter}>
        <Text style={styles.counterText}>
          {index + 1} / {sorted.length}
        </Text>
      </View>

      <View style={styles.dots}>
        {sorted.map((image, position) => (
          <View
            key={image.providerId ?? `${image.url}-${position}`}
            style={[styles.dot, position === index && styles.dotActive]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  single: { width: '100%' },

  counter: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    // Fond sombre translucide : le compteur doit rester lisible quelle que
    // soit la photo derrière lui.
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  counterText: { ...typography.caption, color: colors.text.inverse, fontWeight: '600' },

  dots: {
    position: 'absolute',
    bottom: spacing.md,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
  },
  dotActive: { backgroundColor: colors.text.inverse, width: 18 },
});
