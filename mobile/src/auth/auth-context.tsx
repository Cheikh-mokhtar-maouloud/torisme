import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import type { User } from '@tourism/shared/types';
import type { LoginInput, RegisterInput } from '@tourism/shared/validation';

import { api, ApiRequestError } from '../api/client';
import { clearStoredToken, getStoredToken, storeToken } from './token-storage';

interface AuthResult {
  user: User;
  token: string;
}

interface AuthContextValue {
  user: User | null;
  /** Vrai tant que la session n'a pas été restaurée au démarrage. */
  isRestoring: boolean;
  isAuthenticated: boolean;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
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
        // Jeton expiré ou compte désactivé : on nettoie. Une panne réseau, en
        // revanche, ne doit pas déconnecter l'utilisateur.
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

  const login = useCallback(async (input: LoginInput) => {
    const result = await api.post<AuthResult>('/api/auth/login', input);
    await storeToken(result.token);
    setUser(result.user);
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    const result = await api.post<AuthResult>('/api/auth/register', input);
    await storeToken(result.token);
    setUser(result.user);
  }, []);

  const logout = useCallback(async () => {
    // L'appel serveur efface le cookie ; son échec ne doit pas empêcher la
    // déconnexion locale, qui est ce que l'utilisateur a demandé.
    try {
      await api.post('/api/auth/logout');
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
      register,
      logout,
    }),
    [user, isRestoring, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth doit être utilisé à l’intérieur de <AuthProvider>');
  return context;
}
