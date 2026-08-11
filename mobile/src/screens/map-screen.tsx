import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DEFAULT_MAP_CENTER } from '@tourism/shared/constants';

import { useAttractions, useHotels, useRestaurants } from '../api/queries';
import { Card } from '../components/ui';
import { colors, spacing, typography } from '../theme';

/**
 * Onglet Carte — placeholder de Phase 5.
 *
 * La carte interactive est l'objet de la Phase 6 : elle demande
 * `react-native-maps`, une clé d'API restreinte par bundle id, et un endpoint
 * dédié construit sur `$geoNear` pour trier par distance.
 *
 * L'écran n'est pas vide pour autant : il compte les lieux géolocalisés déjà
 * disponibles, ce qui vérifie dès maintenant que les coordonnées remontent
 * correctement de l'API — le vrai risque étant une inversion latitude/longitude
 * qui ne se verrait qu'une fois la carte affichée.
 */
export function MapScreen() {
  const insets = useSafeAreaInsets();

  const hotels = useHotels({});
  const restaurants = useRestaurants();
  const attractions = useAttractions();

  const counts = [
    { label: 'Hôtels', value: hotels.data?.items.length ?? 0 },
    { label: 'Restaurants', value: restaurants.data?.items.length ?? 0 },
    { label: 'Attractions', value: attractions.data?.items.length ?? 0 },
  ];

  const total = counts.reduce((sum, entry) => sum + entry.value, 0);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.lg }]}>
      <Text style={styles.heading}>Carte</Text>

      <Card style={styles.card}>
        <Text style={styles.icon}>🗺️</Text>
        <Text style={styles.title}>Carte interactive à venir</Text>
        <Text style={styles.text}>
          {total} lieu{total > 1 ? 'x' : ''} géolocalisé{total > 1 ? 's' : ''}{' '}
          {total > 1 ? 'sont' : 'est'} prêt{total > 1 ? 's' : ''} à être affiché
          {total > 1 ? 's' : ''}. La carte, les marqueurs et les filtres arrivent en Phase 6.
        </Text>

        <View style={styles.counts}>
          {counts.map((entry) => (
            <View key={entry.label} style={styles.count}>
              <Text style={styles.countValue}>{entry.value}</Text>
              <Text style={styles.countLabel}>{entry.label}</Text>
            </View>
          ))}
        </View>
      </Card>

      <Text style={styles.footnote}>
        Centre par défaut : {DEFAULT_MAP_CENTER.latitude}, {DEFAULT_MAP_CENTER.longitude}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.subtle, paddingHorizontal: spacing.lg },
  heading: { ...typography.h1, color: colors.text.primary, marginBottom: spacing.lg },

  card: {
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.surface.border,
  },
  icon: { fontSize: 40 },
  title: { ...typography.h3, color: colors.text.primary },
  text: {
    ...typography.body,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: 21,
  },

  counts: { flexDirection: 'row', gap: spacing.xl, marginTop: spacing.lg },
  count: { alignItems: 'center' },
  countValue: { ...typography.h2, color: colors.brand[700] },
  countLabel: { ...typography.caption, color: colors.text.secondary },

  footnote: {
    ...typography.caption,
    color: colors.text.muted,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
});
