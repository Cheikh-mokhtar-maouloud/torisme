import { useState, type ReactElement } from 'react';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { FlatList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Attraction, Excursion, Hotel, Restaurant } from '@tourism/shared/types';

import {
  AttractionCard,
  CardSkeleton,
  ExcursionCard,
  HotelCard,
  RestaurantCard,
} from '../components/cards';
import { Chip, EmptyState, ErrorState, Input } from '../components/ui';
import { FadeInUp } from '../components/motion';
import { useAttractions, useExcursions, useHotels, useRestaurants } from '../api/queries';
import { useTranslation } from 'react-i18next';

import { useDebouncedValue } from '../lib/use-debounced-value';
import { accent, colors, layout, spacing, type AccentName } from '../theme';
import type { PlaceTab, RootStackParamList, TabParamList } from '../navigation/types';

type Navigation = NativeStackNavigationProp<RootStackParamList>;

const TABS: { type: PlaceTab; label: string; accent: AccentName }[] = [
  { type: 'hotels', label: 'types.hotels', accent: 'hotel' },
  { type: 'attractions', label: 'types.attractions', accent: 'attraction' },
  { type: 'excursions', label: 'types.excursions', accent: 'excursion' },
  { type: 'restaurants', label: 'types.restaurants', accent: 'restaurant' },
];

/**
 * Explorer : recherche et listes par type de lieu.
 *
 * La recherche est temporisée : sans cela, chaque frappe déclencherait une
 * requête, soit une dizaine d'allers-retours pour un seul mot sur un réseau
 * mobile déjà lent.
 */
export function ExploreScreen() {
  const { t } = useTranslation();
  const route = useRoute<RouteProp<TabParamList, 'Explore'>>();
  const insets = useSafeAreaInsets();

  const [activeTab, setActiveTab] = useState<PlaceTab>(route.params?.initialType ?? 'hotels');
  const [searchInput, setSearchInput] = useState('');
  const search = useDebouncedValue(searchInput, 400).trim();

  /*
   * L'accueil peut demander un onglet précis en arrivant ici. L'écran restant
   * monté d'une visite à l'autre, l'état doit être ajusté quand le paramètre
   * change.
   *
   * L'ajustement se fait pendant le rendu, pas dans un effet : React réexécute
   * alors immédiatement le composant avec la bonne valeur, sans afficher
   * l'ancien onglet le temps d'un rendu intermédiaire.
   */
  const requestedTab = route.params?.initialType;
  const [lastRequestedTab, setLastRequestedTab] = useState(requestedTab);

  if (requestedTab !== lastRequestedTab) {
    setLastRequestedTab(requestedTab);
    if (requestedTab) setActiveTab(requestedTab);
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.searchRow}>
        <Input
          value={searchInput}
          onChangeText={setSearchInput}
          placeholder={t('common.search')}
          returnKeyType="search"
          autoCorrect={false}
          accessibilityLabel={t('common.search')}
          clearButtonMode="while-editing"
        />
      </View>

      {/*
       * Une rangée simple, et non un `FlatList` horizontal.
       *
       * Les quatre onglets sont fixes : la virtualisation n'apporte rien, et la
       * liste imposait à la rangée une hauteur inférieure à celle des pastilles,
       * qui apparaissaient rognées en haut et en bas. Une `View` se dimensionne
       * sur son contenu, donc le défaut ne peut pas revenir.
       *
       * Les quatre tiennent sur la largeur de l'écran, comme les filtres de la
       * carte : rien à faire défiler pour découvrir un onglet caché.
       */}
      <View style={styles.tabs}>
        {TABS.map((tab) => (
          <Chip
            key={tab.type}
            label={t(tab.label)}
            selected={activeTab === tab.type}
            onPress={() => setActiveTab(tab.type)}
            color={accent[tab.accent].base}
            fill
          />
        ))}
      </View>

      <ExploreList tab={activeTab} search={search} bottomInset={insets.bottom} />
    </View>
  );
}

/**
 * Une liste typée par onglet.
 *
 * Un `FlatList` unique partagé par les quatre types imposerait de caster les
 * éléments, ce qui ferait disparaître toute vérification de types là où elle
 * est justement utile. Quatre branches explicites coûtent quelques lignes et
 * gardent chaque carte reliée à son entité.
 */
function ExploreList({
  tab,
  search,
  bottomInset,
}: {
  tab: PlaceTab;
  search: string;
  bottomInset: number;
}) {
  const { t } = useTranslation();
  const navigation = useNavigation<Navigation>();
  const term = search || undefined;

  // Les quatre hooks sont appelés à chaque rendu — les règles de React
  // l'imposent — mais seul celui de l'onglet actif déclenche une requête,
  // les autres restant servis par le cache de React Query.
  const hotels = useHotels(term ? { search: term } : {});
  const attractions = useAttractions(term);
  const excursions = useExcursions(term);
  const restaurants = useRestaurants(term);

  const query =
    tab === 'attractions'
      ? attractions
      : tab === 'excursions'
        ? excursions
        : tab === 'restaurants'
          ? restaurants
          : hotels;

  if (query.error) {
    return (
      <ErrorState
        message={query.error instanceof Error ? query.error.message : t('common.errorGeneric')}
        onRetry={() => void query.refetch()}
      />
    );
  }

  if (query.isLoading) {
    return (
      <View style={styles.list}>
        {[0, 1, 2].map((index) => (
          <CardSkeleton key={index} />
        ))}
      </View>
    );
  }

  const listProps = {
    contentContainerStyle: [styles.list, { paddingBottom: bottomInset + spacing.xxl }],
    showsVerticalScrollIndicator: false,
    // Le rafraîchissement par traction est l'attente standard sur une liste
    // mobile ; son absence passe pour une application figée.
    refreshing: query.isRefetching,
    onRefresh: () => void query.refetch(),
    ListEmptyComponent: (
      <EmptyState
        title={t('explore.noResults')}
        message={search ? t('explore.noMatch', { term: search }) : t('explore.nothingPublished')}
      />
    ) as ReactElement,
  };

  if (tab === 'attractions') {
    return (
      <FlatList<Attraction>
        data={attractions.data?.items ?? []}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          /*
           * Les six premieres fiches arrivent en cascade, les suivantes
           * immediatement : au-dela d'un ecran, l'utilisateur fait defiler
           * et une attente qu'il ne voit pas ne fait que retarder la
           * lecture.
           */
          <FadeInUp delay={index < 6 ? index * 45 : 0}>
            <AttractionCard
              attraction={item}
              onPress={() =>
                navigation.navigate('AttractionDetail', { attractionId: item.id, name: item.name })
              }
            />
          </FadeInUp>
        )}
        {...listProps}
      />
    );
  }

  if (tab === 'excursions') {
    return (
      <FlatList<Excursion>
        data={excursions.data?.items ?? []}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          /*
           * Les six premieres fiches arrivent en cascade, les suivantes
           * immediatement : au-dela d'un ecran, l'utilisateur fait defiler
           * et une attente qu'il ne voit pas ne fait que retarder la
           * lecture.
           */
          <FadeInUp delay={index < 6 ? index * 45 : 0}>
            <ExcursionCard
              excursion={item}
              onPress={() =>
                navigation.navigate('ExcursionDetail', { excursionId: item.id, title: item.title })
              }
            />
          </FadeInUp>
        )}
        {...listProps}
      />
    );
  }

  if (tab === 'restaurants') {
    return (
      <FlatList<Restaurant>
        data={restaurants.data?.items ?? []}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          /*
           * Les six premieres fiches arrivent en cascade, les suivantes
           * immediatement : au-dela d'un ecran, l'utilisateur fait defiler
           * et une attente qu'il ne voit pas ne fait que retarder la
           * lecture.
           */
          <FadeInUp delay={index < 6 ? index * 45 : 0}>
            <RestaurantCard
              restaurant={item}
              onPress={() =>
                navigation.navigate('RestaurantDetail', { restaurantId: item.id, name: item.name })
              }
            />
          </FadeInUp>
        )}
        {...listProps}
      />
    );
  }

  return (
    <FlatList<Hotel>
      data={hotels.data?.items ?? []}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <HotelCard
          hotel={item}
          onPress={() =>
            navigation.navigate('HotelDetail', { hotelId: item.id, hotelName: item.name })
          }
        />
      )}
      {...listProps}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.background },
  searchRow: { paddingHorizontal: layout.screenPadding, paddingBottom: spacing.md },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: layout.screenPadding,
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  /*
   * `gap` généreux entre les fiches : sans bordure ni fond pour les séparer,
   * c'est le vide qui fait la limite. Douze points ne suffisaient plus une fois
   * les cadres retirés — le texte d'une fiche paraissait appartenir à l'image
   * suivante.
   */
  list: { paddingHorizontal: layout.screenPadding, paddingVertical: spacing.lg, gap: spacing.xxl },
});
