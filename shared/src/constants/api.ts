/**
 * Contrat de surface de l'API, partagé pour éviter les chaînes d'URL dupliquées
 * entre le mobile et le dashboard.
 */

export const API_PREFIX = '/api';

export const API_ROUTES = {
  health: `${API_PREFIX}/health`,

  auth: {
    register: `${API_PREFIX}/auth/register`,
    login: `${API_PREFIX}/auth/login`,
    logout: `${API_PREFIX}/auth/logout`,
    me: `${API_PREFIX}/auth/me`,
    forgotPassword: `${API_PREFIX}/auth/forgot-password`,
    resetPassword: `${API_PREFIX}/auth/reset-password`,
  },

  hotels: {
    list: `${API_PREFIX}/hotels`,
    detail: (id: string) => `${API_PREFIX}/hotels/${id}`,
    rooms: (id: string) => `${API_PREFIX}/hotels/${id}/rooms`,
  },
  rooms: {
    list: `${API_PREFIX}/rooms`,
    detail: (id: string) => `${API_PREFIX}/rooms/${id}`,
    availability: (id: string) => `${API_PREFIX}/rooms/${id}/availability`,
  },
  restaurants: {
    list: `${API_PREFIX}/restaurants`,
    detail: (id: string) => `${API_PREFIX}/restaurants/${id}`,
  },
  attractions: {
    list: `${API_PREFIX}/attractions`,
    detail: (id: string) => `${API_PREFIX}/attractions/${id}`,
  },
  excursions: {
    list: `${API_PREFIX}/excursions`,
    detail: (id: string) => `${API_PREFIX}/excursions/${id}`,
  },
  bookings: {
    list: `${API_PREFIX}/bookings`,
    detail: (id: string) => `${API_PREFIX}/bookings/${id}`,
    cancel: (id: string) => `${API_PREFIX}/bookings/${id}/cancel`,
  },
  reviews: {
    list: `${API_PREFIX}/reviews`,
    detail: (id: string) => `${API_PREFIX}/reviews/${id}`,
  },
  favorites: {
    list: `${API_PREFIX}/favorites`,
    detail: (id: string) => `${API_PREFIX}/favorites/${id}`,
  },
  notifications: {
    list: `${API_PREFIX}/notifications`,
    read: (id: string) => `${API_PREFIX}/notifications/${id}/read`,
  },
  categories: {
    list: `${API_PREFIX}/categories`,
  },
  uploads: {
    sign: `${API_PREFIX}/uploads/sign`,
  },
} as const;

/**
 * Codes d'erreur stables renvoyés par l'API.
 * Le client s'appuie sur le code, jamais sur le message (qui est traduisible).
 */
export const ErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  ROOM_UNAVAILABLE: 'ROOM_UNAVAILABLE',
  EXCURSION_FULL: 'EXCURSION_FULL',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * Événements temps réel.
 *
 * Les noms sont partagés par le service Socket.IO, le backend qui publie et les
 * clients qui écoutent : une chaîne recopiée à trois endroits finirait par
 * diverger, et un événement mal nommé n'échoue pas — il n'arrive simplement
 * jamais.
 */
export const SOCKET_EVENTS = {
  BOOKING_UPDATED: 'booking:updated',
  EXCURSION_SEATS_UPDATED: 'excursion:seats-updated',
  NOTIFICATION_NEW: 'notification:new',
  /** Événements destinés à l'administration : nouvelle demande, avis signalé… */
  ADMIN_ACTIVITY: 'admin:activity',
} as const;

export type SocketEvent = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];

/**
 * Salles Socket.IO.
 *
 * Un client ne rejoint que la salle de son propre compte : le cloisonnement est
 * assuré par l'appartenance aux salles, pas par un filtrage côté client, qui
 * reviendrait à diffuser à tous et à demander poliment d'ignorer.
 */
export const SOCKET_ROOMS = {
  user: (userId: string) => `user:${userId}`,
  admins: 'admins',
} as const;

/** Charge utile d'un événement temps réel. */
/**
 * Canal Redis pub/sub par lequel le backend diffuse vers le service temps réel.
 *
 * Dérivé du préfixe de clés, et non figé : plusieurs environnements peuvent
 * partager une instance Redis, et un canal commun ferait recevoir à `staging`
 * les événements de `production` — donc des notifications réelles poussées vers
 * des appareils de test.
 */
export function realtimeChannel(keyPrefix: string): string {
  return `${keyPrefix}:realtime:events`;
}

export interface RealtimeEvent<TPayload = Record<string, unknown>> {
  event: SocketEvent;
  payload: TPayload;
}
