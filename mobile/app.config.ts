import type { ExpoConfig } from 'expo/config';

/**
 * Configuration Expo générée dynamiquement afin d'injecter les variables
 * d'environnement (URL de l'API, clés de carte) au moment du build, plutôt que
 * de les figer dans un fichier JSON commité.
 *
 * Rappel : tout ce qui passe par `extra` est lisible dans le bundle client.
 * N'y mettre que des valeurs publiques (clés restreintes par domaine/bundle id).
 *
 * Note SDK 57 : l'écran de démarrage n'est plus configuré via la clé `splash`
 * mais par le plugin `expo-splash-screen`, ajouté en Phase 5 avec les icônes finales.
 */
const config: ExpoConfig = {
  name: 'Tourism Platform',
  slug: 'tourism-platform',
  scheme: 'tourism',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.tourismplatform.app',
  },
  android: {
    package: 'com.tourismplatform.app',
    adaptiveIcon: {
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
      backgroundColor: '#0f766e',
    },
  },
  web: {
    favicon: './assets/favicon.png',
  },
  // Ces modules embarquent du code natif : le plugin l'ajoute au projet lors du
  // `prebuild` ou du build EAS. Sans cette déclaration, ils fonctionnent dans
  // Expo Go mais échouent dans une compilation native.
  plugins: [
    'expo-secure-store',
    'expo-image',
    [
      'expo-location',
      {
        // Texte affiché par le système lors de la demande d'autorisation.
        // Une formulation vague fait refuser l'accès et fait rejeter la fiche
        // sur l'App Store.
        locationAlwaysAndWhenInUsePermission:
          'Votre position permet d’afficher les hôtels, restaurants et sites touristiques proches de vous sur la carte.',
      },
    ],
  ],
  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000',
    appEnv: process.env.EXPO_PUBLIC_APP_ENV ?? 'development',
    realtimeUrl: process.env.EXPO_PUBLIC_REALTIME_URL ?? 'http://localhost:4100',
  },
};

export default config;
