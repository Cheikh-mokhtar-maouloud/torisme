import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Notification, PaginationMeta } from '@tourism/shared/types';

import { api, toQuery } from './client';

interface NotificationPage {
  items: Notification[];
  meta: PaginationMeta;
  /** Fourni par la même réponse : une requête séparée pour un compteur serait du gaspillage. */
  unreadCount: number;
}

const notificationsKey = ['notifications'] as const;

export function useNotifications(enabled: boolean) {
  return useQuery({
    queryKey: notificationsKey,
    queryFn: ({ signal }) =>
      api.get<NotificationPage>(`/api/notifications${toQuery({ limit: 50 })}`, signal),
    enabled,
    // Les notifications arrivent sans action de l'utilisateur : on les
    // considère périmées d'emblée, plutôt que de servir un cache d'une minute.
    staleTime: 0,
  });
}

/**
 * Nombre de non-lues, pour la pastille de l'onglet.
 *
 * Dérivé de la même requête que la liste : afficher la pastille ne coûte donc
 * aucun appel supplémentaire.
 */
export function useUnreadCount(enabled: boolean): number {
  const notifications = useNotifications(enabled);
  return notifications.data?.unreadCount ?? 0;
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.patch<Notification>(`/api/notifications/${id}/read`, {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: notificationsKey });
    },
  });
}

export function useMarkAllRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.patch<{ marked: number }>('/api/notifications/read-all', {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: notificationsKey });
    },
  });
}
