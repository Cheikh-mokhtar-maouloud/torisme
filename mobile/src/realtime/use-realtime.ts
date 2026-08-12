import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { io, type Socket } from 'socket.io-client';

import { SOCKET_EVENTS } from '@tourism/shared/constants';

import { appConfig } from '../config/env';
import { getStoredToken } from '../auth/token-storage';
import { useAuth } from '../auth/auth-context';

/**
 * Connexion temps réel.
 *
 * Le rôle du temps réel ici est **d'invalider les caches**, pas de remplacer les
 * données. Un événement dit « ceci a changé » ; React Query recharge alors
 * depuis l'API, qui reste la seule source de vérité. Écrire directement la
 * charge utile dans le cache ferait diverger l'affichage de la base au moindre
 * champ oublié dans l'événement.
 */
export function useRealtime(): void {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !appConfig.realtimeUrl) return;

    let cancelled = false;

    async function connect(): Promise<void> {
      const token = await getStoredToken();
      if (!token || cancelled) return;

      const socket = io(appConfig.realtimeUrl, {
        auth: { token },
        transports: ['websocket'],
        // Réessais espacés : sur un réseau mobile, les coupures sont fréquentes,
        // et une reconnexion agressive vide la batterie sans rien gagner.
        reconnectionDelay: 2_000,
        reconnectionDelayMax: 30_000,
      });

      socket.on(SOCKET_EVENTS.NOTIFICATION_NEW, () => {
        void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      });

      socket.on(SOCKET_EVENTS.BOOKING_UPDATED, () => {
        void queryClient.invalidateQueries({ queryKey: ['bookings'] });
        void queryClient.invalidateQueries({ queryKey: ['excursion-bookings'] });
      });

      socket.on(SOCKET_EVENTS.EXCURSION_SEATS_UPDATED, () => {
        void queryClient.invalidateQueries({ queryKey: ['excursions'] });
      });

      socketRef.current = socket;
    }

    void connect();

    /*
     * Application mise en arrière-plan : la connexion est fermée.
     *
     * iOS suspend de toute façon les sockets en arrière-plan, et les maintenir
     * ouverts consommerait de la batterie pour des événements que l'utilisateur
     * ne voit pas. Au retour au premier plan, on se reconnecte **et** on
     * invalide tout : les événements manqués pendant l'absence sont rattrapés
     * par un rechargement, le service ne conservant aucun historique.
     */
    const handleAppState = (state: AppStateStatus): void => {
      const socket = socketRef.current;
      if (!socket) return;

      if (state === 'active') {
        if (!socket.connected) socket.connect();
        void queryClient.invalidateQueries();
      } else {
        socket.disconnect();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppState);

    return () => {
      cancelled = true;
      subscription.remove();
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [isAuthenticated, queryClient]);
}
