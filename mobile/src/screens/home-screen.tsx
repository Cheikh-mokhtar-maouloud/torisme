import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SUPPORTED_COUNTRIES } from '@tourism/shared/constants';

import {
  AttractionCard,
  CompactCard,
  CompactCardSkeleton,
  ExcursionCard,
  RestaurantCard,
} from '../components/cards';
import { ErrorState } from '../components/ui';
import { Icon, type IconName } from '../components/icon';
import { FadeInUp, PressableScale } from '../components/motion';
import { useAttractions, useExcursions, useHotels, useRestaurants } from '../api/queries';
import { accent, colors, layout, radius, spacing, typography, type AccentName } from '../theme';
import { formatMoney } from '../lib/format';
import type { PlaceTab, RootStackParamList } from '../navigation/types';

type Navigation = NativeStackNavigationProp<RootStackParamList>;

/**
 * Accueil.
 *
 * Structure en carrousels horizontaux plutôt qu'en une longue liste : sur un
 * premier écran, l'objectif est de montrer la variété de l'offre, pas
 * d'épuiser une catégorie. L'utilisateur bascule vers Explorer pour parcourir.
 */
export function HomeScreen() {
  const navigation = useNavigation<Navigation>();
  const insets = useSafeAreaInsets();

  const hotels = useHotels({});
  const attractions = useAttractions();
  const restaurants = useRestaurants();
  const excursions = useExcursions();

  const goToExplore = (initialType: PlaceTab) =>
    navigation.navigate('Tabs', { screen: 'Explore', params: { initialType } });

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md }]}
      showsVerticalScrollIndicator={false}
    >
      <FadeInUp style={styles.header}>
        <Text style={styles.eyebrow}>
          {SUPPORTED_COUNTRIES.map((country) => country.name).join(' · ')}
        </Text>
        <Text style={styles.heading}>Où partez-vous ?</Text>
      </FadeInUp>

      <FadeInUp delay={40}>
        <PressableScale
          accessibilityRole="search"
          accessibilityLabel="Rechercher un hôtel, un restaurant ou une attraction"
          onPress={() => goToExplore('hotels')}
          // Un champ pleine largeur qui s'enfonce autant qu'une pastille
          // paraîtrait mou : plus la surface est grande, plus l'échelle doit
          // être discrète pour que le déplacement des bords reste comparable.
          scaleTo={0.985}
          style={styles.searchBar}
        >
          <View style={styles.searchInner}>
            <Icon name="search" size={19} color={colors.text.muted} />
            <Text style={styles.searchPlaceholder}>Rechercher une destination…</Text>
          </View>
        </PressableScale>
      </FadeInUp>

      <View style={styles.categories}>
        {CATEGORIES.map((category, index) => (
          <FadeInUp
            key={category.type}
            // Décalage court entre les quatre : elles se posent l'une après
            // l'autre de gauche à droite, dans le sens de la lecture.
            delay={60 + index * 50}
            style={styles.categorySlot}
          >
            <PressableScale
              accessibilityLabel={category.label}
              onPress={() => goToExplore(category.type)}
              contentStyle={styles.category}
            >
              {/*
                Le disque prend la teinte de sa catégorie, l'icône sa version
                soutenue. Le gris uniforme employé jusqu'ici obligeait à lire
                les quatre libellés pour distinguer les rubriques ; la couleur
                les sépare avant la lecture, et c'est la même que sur la carte.
              */}
              <View
                style={[styles.categoryIcon, { backgroundColor: accent[category.accent].tint }]}
              >
                <Icon name={category.icon} size={21} color={accent[category.accent].base} />
              </View>
              {/*
                Une seule ligne, et réduite si nécessaire : « Restaurants » est
                plus large que le quart d'écran qui lui revient et débordait de
                la marge droite. Le repli sur deux lignes aurait décalé la
                rangée entière, puisque les quatre partagent la même base.
              */}
              <Text style={styles.categoryLabel} numberOfLines={1} adjustsFontSizeToFit>
                {category.label}
              </Text>
            </PressableScale>
          </FadeInUp>
        ))}
      </View>

      <Section
        title="Hôtels populaires"
        // Après les catégories, dont la dernière arrive à 210 ms.
        delay={260}
        onSeeAll={() => goToExplore('hotels')}
        isLoading={hotels.isLoading}
        error={hotels.error}
        onRetry={() => void hotels.refetch()}
        isEmpty={hotels.data?.items.length === 0}
      >
        {hotels.data?.items.slice(0, 6).map((hotel) => (
          <CompactCard
            key={hotel.id}
            name={hotel.name}
            city={hotel.address.city}
            images={hotel.images}
            rating={hotel.rating}
            reviewCount={hotel.reviewCount}
            {...(hotel.minPricePerNight
              ? { footer: `dès ${formatMoney(hotel.minPricePerNight, hotel.currency)}` }
              : {})}
            onPress={() =>
              navigation.navigate('HotelDetail', { hotelId: hotel.id, hotelName: hotel.name })
            }
          />
        ))}
      </Section>

      <Section
        title="Attractions à découvrir"
        /*
         * Les sections suivantes sont hors de l'écran au chargement : leur
         * décalage ne sert qu'à éviter qu'elles soient déjà posées si
         * l'utilisateur fait défiler aussitôt. Inutile de l'allonger davantage
         * — une attente qu'on ne voit pas n'embellit rien.
         */
        delay={310}
        onSeeAll={() => goToExplore('attractions')}
        isLoading={attractions.isLoading}
        error={attractions.error}
        onRetry={() => void attractions.refetch()}
        isEmpty={attractions.data?.items.length === 0}
      >
        {attractions.data?.items.slice(0, 6).map((attraction) => (
          <AttractionCard
            key={attraction.id}
            attraction={attraction}
            onPress={() =>
              navigation.navigate('AttractionDetail', {
                attractionId: attraction.id,
                name: attraction.name,
              })
            }
          />
        ))}
      </Section>

      <Section
        title="Excursions programmées"
        delay={350}
        onSeeAll={() => goToExplore('excursions')}
        isLoading={excursions.isLoading}
        error={excursions.error}
        onRetry={() => void excursions.refetch()}
        isEmpty={excursions.data?.items.length === 0}
      >
        {excursions.data?.items.slice(0, 6).map((excursion) => (
          <ExcursionCard
            key={excursion.id}
            excursion={excursion}
            onPress={() =>
              navigation.navigate('ExcursionDetail', {
                excursionId: excursion.id,
                title: excursion.title,
              })
            }
          />
        ))}
      </Section>

      <Section
        title="Où manger"
        delay={390}
        onSeeAll={() => goToExplore('restaurants')}
        isLoading={restaurants.isLoading}
        error={restaurants.error}
        onRetry={() => void restaurants.refetch()}
        isEmpty={restaurants.data?.items.length === 0}
      >
        {restaurants.data?.items.slice(0, 6).map((restaurant) => (
          <RestaurantCard
            key={restaurant.id}
            restaurant={restaurant}
            onPress={() =>
              navigation.navigate('RestaurantDetail', {
                restaurantId: restaurant.id,
                name: restaurant.name,
              })
            }
          />
        ))}
      </Section>

      <View style={{ height: insets.bottom + spacing.xl }} />
    </ScrollView>
  );
}

const CATEGORIES: { type: PlaceTab; label: string; icon: IconName; accent: AccentName }[] = [
  { type: 'hotels', label: 'Hôtels', icon: 'hotel', accent: 'hotel' },
  { type: 'attractions', label: 'Sites', icon: 'attraction', accent: 'attraction' },
  { type: 'excursions', label: 'Excursions', icon: 'excursion', accent: 'excursion' },
  { type: 'restaurants', label: 'Restaurants', icon: 'restaurant', accent: 'restaurant' },
];

/**
 * Section à défilement horizontal.
 *
 * Chaque section gère ses trois états — chargement, erreur, vide — de façon
 * indépendante : l'échec d'un carrousel ne doit pas vider tout l'accueil.
 */
function Section({
  title,
  onSeeAll,
  isLoading,
  error,
  onRetry,
  isEmpty,
  delay,
  children,
}: {
  title: string;
  onSeeAll: () => void;
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
  isEmpty: boolean | undefined;
  /** Décalage d'apparition, croissant avec la position dans la page. */
  delay: number;
  children: React.ReactNode;
}) {
  return (
    <FadeInUp style={styles.section} delay={delay}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Pressable accessibilityRole="button" onPress={onSeeAll} hitSlop={8}>
          <Text style={styles.sectionLink}>Tout voir</Text>
        </Pressable>
      </View>

      {error ? (
        <ErrorState
          message={error instanceof Error ? error.message : 'Chargement impossible.'}
          onRetry={onRetry}
        />
      ) : isEmpty ? (
        <Text style={styles.sectionEmpty}>Rien à afficher pour le moment.</Text>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.carousel}
        >
          {isLoading ? [0, 1, 2].map((index) => <CompactCardSkeleton key={index} />) : children}
        </ScrollView>
      )}
    </FadeInUp>
  );
}

const styles = StyleSheet.create({
  // Fond blanc, non gris. Dans une mise en page éditoriale, les fiches ne sont
  // pas des cartes posées sur un fond : elles sont la page. Un fond gris
  // obligerait à les enfermer dans des rectangles blancs pour les détacher.
  screen: { flex: 1, backgroundColor: colors.surface.background },
  content: { paddingBottom: spacing.xl },

  header: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.sm,
    marginBottom: spacing.xl,
  },
  eyebrow: {
    ...typography.overline,
    color: colors.text.muted,
    textTransform: 'uppercase',
  },
  heading: { ...typography.display, color: colors.text.primary, marginTop: spacing.sm },

  /*
   * La marge reste sur la zone tactile, l'apparence passe à l'intérieur.
   *
   * C'est la vue animée qui s'intercale entre les deux : lui laisser le fond et
   * le rayon ferait grandir la surface colorée avec l'échelle, alors qu'on veut
   * seulement voir le champ s'enfoncer.
   */
  searchBar: { marginHorizontal: layout.screenPadding },
  searchInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.neutral[100],
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    height: 52,
  },
  searchPlaceholder: { ...typography.body, color: colors.text.muted },

  categories: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: layout.screenPadding,
    marginTop: spacing.xl,
  },
  // L'enveloppe animée porte le partage de largeur, la pastille son contenu :
  // appliquer `flex: 1` au bouton lui-même le laisserait à sa largeur naturelle,
  // le parent animé étant désormais l'enfant direct de la rangée.
  categorySlot: { flex: 1 },
  // `alignItems` centre la pastille et son libellé l'un sur l'autre ;
  // `paddingHorizontal` empêche deux libellés voisins de se toucher.
  category: { alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.xs },
  /*
   * L'icône est posée dans un disque teinté : à cette taille, un trait fin
   * isolé sur du blanc se perd. Le disque lui donne une surface et aligne les
   * quatre catégories sur une même grille, quel que soit le dessin.
   *
   * La couleur du fond vient de la catégorie et se pose au rendu — elle ne peut
   * donc pas figurer ici.
   */
  categoryIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryLabel: { ...typography.caption, color: colors.text.secondary, fontWeight: '600' },

  section: { marginTop: spacing.xxl },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  sectionTitle: { ...typography.h2, color: colors.text.primary },
  sectionLink: { ...typography.caption, color: colors.brand[700], fontWeight: '600' },
  sectionEmpty: {
    ...typography.caption,
    color: colors.text.muted,
    paddingHorizontal: spacing.lg,
  },
  carousel: { paddingHorizontal: spacing.lg, gap: spacing.md },
});
