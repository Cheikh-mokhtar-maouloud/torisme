import { NavigationContainer, DefaultTheme, type Theme } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ApiRequestError } from './src/api/client';
import { AuthProvider, useAuth } from './src/auth/auth-context';
import { RootNavigator } from './src/navigation/root-navigator';
import { colors } from './src/theme';

/**
 * Client de données partagé par toute l'application.
 *
 * Créé au niveau du module et non dans le composant : le recréer à chaque
 * rendu viderait le cache et relancerait toutes les requêtes.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Les fiches de contenu changent rarement ; une minute évite de
      // recharger à chaque aller-retour entre liste et détail.
      staleTime: 60_000,
      retry: (failureCount, error) => {
        // Réessayer une erreur d'autorisation ou de validation est inutile :
        // seules les défaillances réseau méritent une nouvelle tentative.
        if (error instanceof ApiRequestError && !error.isNetworkError) return false;
        return failureCount < 2;
      },
    },
    mutations: {
      // Une mutation rejouée automatiquement pourrait créer deux réservations.
      retry: false,
    },
  },
});

/** Thème de navigation aligné sur les jetons de design de l'application. */
const navigationTheme: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.brand[600],
    background: colors.surface.subtle,
    card: colors.surface.background,
    text: colors.text.primary,
    border: colors.surface.border,
  },
};

export default function App() {
  return (
    // `GestureHandlerRootView` doit envelopper toute l'application, sinon les
    // gestes de navigation ne remontent pas sur Android.
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <StatusBar style="dark" />
            <AppContent />
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/**
 * Attend la restauration de session avant d'afficher la navigation.
 *
 * Sans cette attente, un utilisateur déjà connecté verrait brièvement les
 * écrans en mode déconnecté — « Connectez-vous » puis son profil — un
 * scintillement qui donne l'impression d'une déconnexion involontaire.
 */
function AppContent() {
  const { isRestoring } = useAuth();

  if (isRestoring) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color={colors.brand[600]} />
      </View>
    );
  }

  return (
    <NavigationContainer theme={navigationTheme}>
      <RootNavigator />
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface.subtle,
  },
});
