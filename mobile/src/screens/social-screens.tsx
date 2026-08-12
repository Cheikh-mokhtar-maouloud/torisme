import { useState } from 'react';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PlaceType, REVIEW } from '@tourism/shared/constants';

import { ApiRequestError } from '../api/client';
import { useCreateReview, useFavorites, type FavoriteWithTarget } from '../api/use-social';
import { useAuth } from '../auth/auth-context';
import { PlaceImage } from '../components/place-image';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  Rating,
  Skeleton,
} from '../components/ui';
import { formatMoney } from '../lib/format';
import { colors, radius, spacing, typography } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Navigation = NativeStackNavigationProp<RootStackParamList>;

const TYPE_LABELS: Record<PlaceType, string> = {
  [PlaceType.HOTEL]: 'Hôtel',
  [PlaceType.RESTAURANT]: 'Restaurant',
  [PlaceType.ATTRACTION]: 'Site',
  [PlaceType.EXCURSION]: 'Excursion',
};

/** Page Favoris, accessible depuis le profil. */
export function FavoritesScreen() {
  const navigation = useNavigation<Navigation>();
  const insets = useSafeAreaInsets();
  const { isAuthenticated } = useAuth();

  const favorites = useFavorites(isAuthenticated);

  if (!isAuthenticated) {
    return (
      <View style={styles.centered}>
        <EmptyState
          title="Vos favoris"
          message="Connectez-vous pour retrouver les lieux que vous avez enregistrés."
          action={
            <Button
              label="Se connecter"
              onPress={() => navigation.navigate('Login')}
              style={styles.wideButton}
            />
          }
        />
      </View>
    );
  }

  if (favorites.error) {
    return (
      <ErrorState
        message={
          favorites.error instanceof Error ? favorites.error.message : 'Chargement impossible.'
        }
        onRetry={() => void favorites.refetch()}
      />
    );
  }

  if (favorites.isLoading) {
    return (
      <View style={styles.list}>
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} height={92} />
        ))}
      </View>
    );
  }

  return (
    <FlatList
      data={favorites.data?.items ?? []}
      keyExtractor={(favorite) => favorite.id}
      contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xxl }]}
      showsVerticalScrollIndicator={false}
      refreshing={favorites.isRefetching}
      onRefresh={() => void favorites.refetch()}
      renderItem={({ item }) => <FavoriteRow favorite={item} navigation={navigation} />}
      ListEmptyComponent={
        <EmptyState
          title="Aucun favori"
          message="Touchez le cœur sur une fiche pour l’enregistrer ici."
          action={
            <Button
              label="Explorer"
              variant="secondary"
              onPress={() => navigation.navigate('Tabs', { screen: 'Explore' })}
              style={styles.wideButton}
            />
          }
        />
      }
    />
  );
}

function FavoriteRow({
  favorite,
  navigation,
}: {
  favorite: FavoriteWithTarget;
  navigation: Navigation;
}) {
  const { target, targetType } = favorite;

  // Fiche supprimée entre-temps : on l'affiche neutralisée plutôt que de la
  // masquer, sans quoi l'utilisateur ne comprendrait pas la disparition.
  if (!target) {
    return (
      <Card style={styles.favoriteCard}>
        <View style={styles.favoriteBody}>
          <Text style={styles.unavailableTitle}>Fiche supprimée</Text>
          <Text style={styles.favoriteCity}>Ce lieu n’est plus disponible.</Text>
        </View>
      </Card>
    );
  }

  const open = () => {
    if (targetType === PlaceType.HOTEL) {
      navigation.navigate('HotelDetail', { hotelId: target.id, hotelName: target.name });
    } else if (targetType === PlaceType.RESTAURANT) {
      navigation.navigate('RestaurantDetail', { restaurantId: target.id, name: target.name });
    } else if (targetType === PlaceType.ATTRACTION) {
      navigation.navigate('AttractionDetail', { attractionId: target.id, name: target.name });
    } else {
      navigation.navigate('ExcursionDetail', { excursionId: target.id, title: target.name });
    }
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={target.name}
      onPress={open}
      style={({ pressed }) => [pressed && styles.pressed]}
    >
      <Card style={styles.favoriteCard}>
        <View style={styles.favoriteThumb}>
          <PlaceImage
            images={target.imageUrl ? [{ url: target.imageUrl, order: 0 }] : []}
            name={target.name}
            rounded={false}
          />
        </View>

        <View style={styles.favoriteBody}>
          <Text style={styles.favoriteType}>{TYPE_LABELS[targetType]}</Text>
          <Text style={styles.favoriteName} numberOfLines={1}>
            {target.name}
          </Text>
          <Text style={styles.favoriteCity} numberOfLines={1}>
            {target.city}
          </Text>

          <View style={styles.favoriteFooter}>
            <Rating value={target.rating} count={target.reviewCount} />
            {target.price ? (
              <Text style={styles.favoritePrice}>
                {formatMoney(target.price, target.currency ?? 'MRU')}
              </Text>
            ) : null}
          </View>
        </View>

        {target.unavailable ? (
          <View style={styles.unavailableBadge}>
            <Badge label="Indisponible" tone="warning" />
          </View>
        ) : null}
      </Card>
    </Pressable>
  );
}

/**
 * Rédaction d'un avis.
 *
 * L'API refuse un avis sur un lieu réservable sans séjour confirmé ; le message
 * d'erreur qu'elle renvoie est repris tel quel, il explique déjà la règle.
 */
export function WriteReviewScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'WriteReview'>>();
  const navigation = useNavigation<Navigation>();
  const { targetType, targetId, targetName } = route.params;

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [formError, setFormError] = useState<string>();

  const createReview = useCreateReview();

  const handleSubmit = () => {
    setFormError(undefined);

    if (rating === 0) {
      setFormError('Choisissez une note.');
      return;
    }

    if (comment.trim() && comment.trim().length < 10) {
      setFormError('Le commentaire doit faire au moins 10 caractères, ou rester vide.');
      return;
    }

    createReview.mutate(
      {
        targetType,
        targetId,
        rating,
        ...(comment.trim() ? { comment: comment.trim() } : {}),
        images: [],
      },
      {
        onSuccess: () => navigation.goBack(),
        onError: (error) =>
          setFormError(
            error instanceof ApiRequestError ? error.message : 'Envoi impossible. Réessayez.',
          ),
      },
    );
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.screen}
    >
      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        <Text style={styles.formTitle}>{targetName}</Text>
        <Text style={styles.formHint}>
          Votre avis sera publié après vérification par l’équipe de modération.
        </Text>

        <Text style={styles.label}>Votre note</Text>
        <View style={styles.starsRow}>
          {[1, 2, 3, 4, 5].map((value) => (
            <Pressable
              key={value}
              accessibilityRole="button"
              accessibilityLabel={`${value} étoile${value > 1 ? 's' : ''}`}
              accessibilityState={{ selected: rating === value }}
              onPress={() => setRating(value)}
              hitSlop={6}
            >
              <Text style={[styles.starChoice, value <= rating && styles.starChoiceActive]}>
                {value <= rating ? '★' : '☆'}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Commentaire (facultatif)</Text>
        <Input
          value={comment}
          onChangeText={setComment}
          placeholder="Ce qui vous a plu, ce qui pourrait être amélioré…"
          multiline
          numberOfLines={5}
          maxLength={REVIEW.MAX_COMMENT_LENGTH}
          style={styles.textarea}
        />
        <Text style={styles.counter}>
          {comment.length} / {REVIEW.MAX_COMMENT_LENGTH}
        </Text>

        {formError ? <Text style={styles.error}>{formError}</Text> : null}

        <Button
          label="Publier mon avis"
          onPress={handleSubmit}
          loading={createReview.isPending}
          style={styles.submit}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.background },
  centered: { flex: 1, justifyContent: 'center', backgroundColor: colors.surface.subtle },
  pressed: { opacity: 0.85 },
  wideButton: { minWidth: 200 },

  list: {
    padding: spacing.lg,
    gap: spacing.md,
    backgroundColor: colors.surface.subtle,
    flexGrow: 1,
  },
  favoriteCard: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.surface.border,
  },
  favoriteThumb: { width: 76, height: 76, borderRadius: radius.md, overflow: 'hidden' },
  favoriteBody: { flex: 1, gap: 1, paddingVertical: 2 },
  favoriteType: {
    ...typography.caption,
    color: colors.brand[700],
    fontSize: 11,
    fontWeight: '600',
  },
  favoriteName: { ...typography.body, fontWeight: '600', color: colors.text.primary },
  favoriteCity: { ...typography.caption, color: colors.text.secondary },
  favoriteFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  favoritePrice: { ...typography.caption, color: colors.text.primary, fontWeight: '700' },
  unavailableTitle: { ...typography.body, fontWeight: '600', color: colors.text.muted },
  unavailableBadge: { position: 'absolute', top: spacing.sm, right: spacing.sm },

  form: { padding: spacing.xl, gap: spacing.sm },
  formTitle: { ...typography.h2, color: colors.text.primary },
  formHint: { ...typography.caption, color: colors.text.muted, marginBottom: spacing.lg },
  label: {
    ...typography.caption,
    color: colors.text.secondary,
    fontWeight: '600',
    marginTop: spacing.md,
  },
  starsRow: { flexDirection: 'row', gap: spacing.sm },
  starChoice: { fontSize: 34, color: colors.surface.border },
  starChoiceActive: { color: colors.sand[500] },
  textarea: { minHeight: 120, paddingTop: spacing.md, textAlignVertical: 'top' },
  counter: { ...typography.caption, color: colors.text.muted, textAlign: 'right' },
  error: { ...typography.caption, color: colors.status.danger, marginTop: spacing.sm },
  submit: { marginTop: spacing.lg },
});
