import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import type { PlaceType } from '@tourism/shared/constants';
import type { Review } from '@tourism/shared/types';

import { useIsFavorite, useReportReview, useReviews, useToggleFavorite } from '../api/use-social';
import { useAuth } from '../auth/auth-context';
import { formatDate } from '../lib/format';
import { colors, radius, spacing, typography } from '../theme';
import type { RootStackParamList } from '../navigation/types';
import { Button, Card, Skeleton } from './ui';

type Navigation = NativeStackNavigationProp<RootStackParamList>;

/**
 * Bouton favori.
 *
 * Visible même déconnecté : le masquer priverait l'utilisateur du signal que la
 * fonctionnalité existe. L'appui redirige alors vers la connexion.
 */
export function FavoriteButton({
  targetType,
  targetId,
}: {
  targetType: PlaceType;
  targetId: string;
}) {
  const navigation = useNavigation<Navigation>();
  const { isAuthenticated } = useAuth();
  const { isFavorite } = useIsFavorite(targetType, targetId, isAuthenticated);
  const toggle = useToggleFavorite();

  const handlePress = () => {
    if (!isAuthenticated) {
      navigation.navigate('Login', { message: 'Connectez-vous pour enregistrer vos favoris.' });
      return;
    }
    toggle.mutate({ targetType, targetId, isFavorite });
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: isFavorite }}
      accessibilityLabel={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
      onPress={handlePress}
      disabled={toggle.isPending}
      hitSlop={10}
      style={({ pressed }) => [styles.favoriteButton, pressed && styles.pressed]}
    >
      <Text style={[styles.favoriteIcon, isFavorite && styles.favoriteIconActive]}>
        {isFavorite ? '♥' : '♡'}
      </Text>
    </Pressable>
  );
}

/**
 * Section « avis » d'une fiche.
 *
 * Seuls les avis approuvés remontent de l'API : la modération est faite en
 * amont, l'application n'a rien à filtrer.
 */
export function ReviewsSection({
  targetType,
  targetId,
  targetName,
}: {
  targetType: PlaceType;
  targetId: string;
  targetName: string;
}) {
  const navigation = useNavigation<Navigation>();
  const reviews = useReviews(targetType, targetId);
  const items = reviews.data?.items ?? [];

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>
          Avis {items.length > 0 ? <Text style={styles.count}>({items.length})</Text> : null}
        </Text>
      </View>

      {reviews.isLoading ? (
        <Skeleton height={80} />
      ) : items.length === 0 ? (
        <Text style={styles.empty}>Aucun avis pour le moment. Soyez le premier.</Text>
      ) : (
        <View style={styles.reviewList}>
          {items.slice(0, 5).map((review) => (
            <ReviewItem key={review.id} review={review} />
          ))}
        </View>
      )}

      <Button
        label="Donner mon avis"
        variant="secondary"
        onPress={() => navigation.navigate('WriteReview', { targetType, targetId, targetName })}
        style={styles.writeButton}
      />
    </View>
  );
}

function ReviewItem({ review }: { review: Review }) {
  const { isAuthenticated } = useAuth();
  const report = useReportReview();

  const handleReport = () => {
    if (!isAuthenticated) return;

    Alert.alert(
      'Signaler cet avis',
      'Il sera examiné par l’équipe de modération. Il reste visible entre-temps.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Signaler',
          style: 'destructive',
          onPress: () =>
            report.mutate(review.id, {
              onSuccess: () => Alert.alert('Merci', 'Votre signalement a bien été transmis.'),
            }),
        },
      ],
    );
  };

  return (
    <Card style={styles.reviewCard}>
      <View style={styles.reviewHeader}>
        <Text style={styles.stars}>{'★'.repeat(review.rating)}</Text>
        <Text style={styles.reviewDate}>{formatDate(review.createdAt)}</Text>
      </View>

      {review.comment ? <Text style={styles.comment}>{review.comment}</Text> : null}

      <View style={styles.reviewFooter}>
        {review.bookingId ? <Text style={styles.verified}>✓ Séjour vérifié</Text> : <View />}
        {isAuthenticated ? (
          <Pressable accessibilityRole="button" onPress={handleReport} hitSlop={8}>
            <Text style={styles.report}>Signaler</Text>
          </Pressable>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.6 },

  favoriteButton: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.surface.border,
  },
  favoriteIcon: { fontSize: 20, color: colors.text.muted, lineHeight: 24 },
  favoriteIconActive: { color: colors.status.danger },

  section: { marginTop: spacing.xl },
  sectionHeader: { marginBottom: spacing.sm },
  sectionTitle: { ...typography.h3, color: colors.text.primary },
  count: { ...typography.body, color: colors.text.muted, fontWeight: '400' },
  empty: { ...typography.body, color: colors.text.muted },

  reviewList: { gap: spacing.sm },
  reviewCard: {
    padding: spacing.md,
    gap: spacing.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.surface.border,
  },
  reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stars: { color: colors.sand[500], fontSize: 14 },
  reviewDate: { ...typography.caption, color: colors.text.muted },
  comment: { ...typography.body, color: colors.text.secondary, lineHeight: 21 },
  reviewFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  verified: { ...typography.caption, color: colors.status.success, fontWeight: '600' },
  report: { ...typography.caption, color: colors.text.muted, textDecorationLine: 'underline' },

  writeButton: { marginTop: spacing.md },
});
