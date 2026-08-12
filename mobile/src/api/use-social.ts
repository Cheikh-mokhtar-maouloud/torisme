import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { PlaceType } from '@tourism/shared/constants';
import type { Favorite, Review } from '@tourism/shared/types';
import type { CreateReviewInput } from '@tourism/shared/validation';

import { api, toQuery } from './client';

/** Cible enrichie renvoyée par la liste des favoris. */
export interface FavoriteWithTarget extends Favorite {
  target: {
    id: string;
    name: string;
    city: string;
    imageUrl?: string;
    rating: number;
    reviewCount: number;
    price?: number;
    currency?: string;
    unavailable: boolean;
  } | null;
}

const favoritesKey = ['favorites'] as const;
const reviewsKey = (targetType: string, targetId: string) =>
  ['reviews', targetType, targetId] as const;

export function useFavorites(enabled: boolean) {
  return useQuery({
    queryKey: favoritesKey,
    queryFn: ({ signal }) => api.list<FavoriteWithTarget>('/api/favorites?limit=50', signal),
    enabled,
  });
}

/**
 * État « en favori » d'un lieu.
 *
 * Dérivé de la liste complète plutôt que d'une requête par fiche : la liste est
 * déjà en cache dès l'ouverture de l'onglet Favoris, et interroger le serveur à
 * chaque fiche consultée multiplierait les allers-retours pour une information
 * d'un seul bit.
 */
export function useIsFavorite(targetType: PlaceType, targetId: string, enabled: boolean) {
  const favorites = useFavorites(enabled);

  return {
    isFavorite: (favorites.data?.items ?? []).some(
      (favorite) => favorite.targetType === targetType && favorite.targetId === targetId,
    ),
    isReady: !favorites.isLoading,
  };
}

export function useToggleFavorite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      targetType,
      targetId,
      isFavorite,
    }: {
      targetType: PlaceType;
      targetId: string;
      isFavorite: boolean;
    }) => {
      if (isFavorite) {
        await api.delete(`/api/favorites${toQuery({ targetType, targetId })}`);
        return;
      }
      await api.post<Favorite>('/api/favorites', { targetType, targetId });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: favoritesKey });
    },
  });
}

export function useReviews(targetType: PlaceType, targetId: string) {
  return useQuery({
    queryKey: reviewsKey(targetType, targetId),
    queryFn: ({ signal }) =>
      api.list<Review>(`/api/reviews${toQuery({ targetType, targetId, limit: 20 })}`, signal),
  });
}

/** Avis déposés par l'utilisateur, tous statuts confondus. */
export function useMyReviews(enabled: boolean) {
  return useQuery({
    queryKey: ['reviews', 'me'],
    queryFn: ({ signal }) => api.list<Review>('/api/reviews?scope=me&limit=50', signal),
    enabled,
  });
}

export function useCreateReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateReviewInput) => api.post<Review>('/api/reviews', input),
    onSuccess: (review) => {
      void queryClient.invalidateQueries({
        queryKey: reviewsKey(review.targetType, review.targetId),
      });
      void queryClient.invalidateQueries({ queryKey: ['reviews', 'me'] });
    },
  });
}

export function useReportReview() {
  return useMutation({
    mutationFn: (reviewId: string) => api.post(`/api/reviews/${reviewId}/report`),
  });
}
