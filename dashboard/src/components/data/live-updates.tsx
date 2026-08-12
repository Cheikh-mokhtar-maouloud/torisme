'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { io } from 'socket.io-client';

import { SOCKET_EVENTS } from '@tourism/shared/constants';

/**
 * Rafraîchissement automatique de la page sur activité administrative.
 *
 * Le dashboard est rendu côté serveur : plutôt que de manipuler un état local,
 * l'événement déclenche un `router.refresh()`, qui rejoue le rendu serveur avec
 * les données à jour. Aucune logique d'affichage n'est ainsi dupliquée entre le
 * chemin normal et le chemin temps réel.
 *
 * Le jeton est fourni par le serveur : le navigateur ne peut pas lire le cookie
 * de session, qui est HTTP-only.
 */
export function LiveUpdates({ token, realtimeUrl }: { token: string; realtimeUrl: string }) {
  const router = useRouter();
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!realtimeUrl || !token) return;

    const socket = io(realtimeUrl, {
      auth: { token },
      transports: ['websocket'],
      reconnectionDelay: 2_000,
      reconnectionDelayMax: 30_000,
    });

    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));

    const refresh = () => router.refresh();
    socket.on(SOCKET_EVENTS.ADMIN_ACTIVITY, refresh);
    socket.on(SOCKET_EVENTS.EXCURSION_SEATS_UPDATED, refresh);

    return () => {
      socket.close();
    };
  }, [realtimeUrl, token, router]);

  // L'indicateur reste discret : il informe sans occuper l'attention, et son
  // absence signale au contraire une anomalie qu'un administrateur doit voir.
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
      <span
        aria-hidden
        className={`size-2 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-slate-300'}`}
      />
      {isConnected ? 'Mises à jour en direct' : 'Hors ligne'}
    </span>
  );
}
