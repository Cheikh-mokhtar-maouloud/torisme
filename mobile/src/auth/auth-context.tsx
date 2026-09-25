import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import type { User } from '@tourism/shared/types';
import type { LoginInput, RegisterInput } from '@tourism/shared/validation';

import { api, ApiRequestError } from '../api/client';
import {
  clearStoredToken,
  getStoredRefreshToken,
  getStoredToken,
  storeRefreshToken,
  storeToken,
} from './token-storage';

interface AuthResult {
  user: User;
  token: string;
  refreshToken: string;
}

interface AuthContextValue {
  user: User | null;
  /** Vrai tant que la session n'a pas été restaurée au démarrage. */
  isRestoring: boolean;
  isAuthenticated: boolean;
  login: (input: LoginInput) => Promise<void>;
  /** Échange un jeton d'identité Google contre une session de l'application. */
  loginWithGoogle: (idToken: string) => Promise<void>;
  /**
   * Crée le compte. **N'ouvre pas de session** : l'adresse doit d'abord être
   * vérifiée. L'appelant enchaîne sur l'écran de saisie du code.
   */
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Session de l'application.
 *
 * La navigation n'est **pas** conditionnée à l'authentification : un touriste
 * doit pouvoir parcourir hôtels, restaurants et attractions sans compte. La
 * connexion n'est demandée qu'au moment de réserver ou d'ouvrir le profil —
 * imposer un mur de connexion à l'ouverture ferait perdre l'essentiel des
 * visiteurs avant qu'ils aient vu le contenu.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);

  // Restauration au démarrage : un jeton stocké ne prouve pas que la session
  // est encore valide, on le confronte donc au serveur.
  useEffect(() => {
    let cancelled = false;

    async function restore(): Promise<void> {
      const token = await getStoredToken();

      if (!token) {
        if (!cancelled) setIsRestoring(false);
        return;
      }

      try {
        const currentUser = await api.get<User>('/api/auth/me');
        if (!cancelled) setUser(currentUser);
      } catch (error) {
        /*
         * Le client tente déjà un renouvellement transparent sur 401. Si l'on
         * arrive ici avec une erreur d'autorisation, c'est que le jeton de
         * rafraîchissement lui-même est refusé : la session est terminée.
         *
         * Une panne réseau, en revanche, ne doit pas déconnecter l'utilisateur.
         */
        if (error instanceof ApiRequestError && error.isUnauthorized) {
          await clearStoredToken();
        }
      } finally {
        if (!cancelled) setIsRestoring(false);
      }
    }

    void restore();
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback(async (result: AuthResult) => {
    await storeToken(result.token);
    await storeRefreshToken(result.refreshToken);
    setUser(result.user);
  }, []);

  const login = useCallback(
    async (input: LoginInput) => {
      await persist(await api.post<AuthResult>('/api/auth/login', input));
    },
    [persist],
  );

  const loginWithGoogle = useCallback(
    async (idToken: string) => {
      /*
       * Le jeton est transmis au serveur, qui seul le vérifie.
       *
       * L'application ne le décode pas et n'en tire aucune conclusion : un
       * client peut être modifié, et croire sur parole ce qu'il affirme
       * reviendrait à laisser n'importe qui ouvrir n'importe quelle session.
       */
      await persist(await api.post<AuthResult>('/api/auth/google', { idToken }));
    },
    [persist],
  );

  const register = useCallback(
    async (input: RegisterInput) => {
      /*
       * Aucun `persist` : le serveur ne renvoie plus de jeton tant que
       * l'adresse n'est pas vérifiée. Enregistrer une session ici échouerait
       * silencieusement — le jeton serait `undefined` — et laisserait
       * l'application dans un état à demi connecté.
       */
      await api.post('/api/auth/register', input);
    },
    // Aucune dépendance : la fonction n'ouvre plus de session et ne lit donc
    // plus rien du composant.
    [],
  );

  /** Rafraîchit l'utilisateur en mémoire après une modification du profil. */
  const refreshUser = useCallback(async () => {
    setUser(await api.get<User>('/api/auth/me'));
  }, []);

  const logout = useCallback(async () => {
    // L'appel serveur efface le cookie ; son échec ne doit pas empêcher la
    // déconnexion locale, qui est ce que l'utilisateur a demandé.
    try {
      // Le jeton de rafraîchissement est transmis pour être **révoqué** côté
      // serveur : sans lui, il resterait valide trente jours après la
      // déconnexion.
      await api.post('/api/auth/logout', { refreshToken: await getStoredRefreshToken() });
    } catch {
      // Ignoré volontairement.
    }
    await clearStoredToken();
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isRestoring,
      isAuthenticated: user !== null,
      login,
      loginWithGoogle,
      register,
      logout,
      refreshUser,
    }),
    [user, isRestoring, login, loginWithGoogle, register, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth doit être utilisé à l’intérieur de <AuthProvider>');
  return context;
}
