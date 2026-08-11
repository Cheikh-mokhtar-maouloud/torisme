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
  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000',
    appEnv: process.env.EXPO_PUBLIC_APP_ENV ?? 'development',
  },
};

export default config;
