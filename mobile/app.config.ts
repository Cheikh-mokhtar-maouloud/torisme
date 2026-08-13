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
    /*
     * Clé Google Maps, requise pour les compilations natives Android.
     *
     * Contrairement à ce qui était noté ici, **Expo Go ne suffit pas toujours**.
     * Sa clé embarquée est restreinte à sa propre signature : sur un émulateur,
     * le SDK répond « Authorization failure » et la carte s'affiche vide, avec
     * ses marqueurs et ses filtres fonctionnels mais sans tuiles. Vérifié le
     * 13/08/2026 sur un AVD Android 10 avec Play Services 26.22.
     *
     * Pour voir la carte pendant le développement, il faut donc une clé propre :
     *   EXPO_PUBLIC_MAPS_API_KEY=… npx expo start
     *
     * La clé doit être restreinte au nom de paquet et à la signature de
     * l'application dans la console Google Cloud : intégrée au bundle, elle est
     * extractible de tout APK. Sans restriction, elle serait réutilisable par
     * n'importe qui et facturée sur votre compte.
     *
     * iOS utilise Apple Maps par défaut et ne demande aucune clé.
     */
    config: process.env.EXPO_PUBLIC_MAPS_API_KEY
      ? { googleMaps: { apiKey: process.env.EXPO_PUBLIC_MAPS_API_KEY } }
      : undefined,
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
