/**
 * Jetons de design de l'application mobile.
 *
 * Source unique de vérité pour les couleurs, espacements et rayons : aucun
 * composant ne doit contenir de valeur hexadécimale ou de marge magique.
 * Identité propre à la plateforme (teal atlantique + sable saharien).
 */

export const colors = {
  brand: {
    50: '#f0fdfa',
    100: '#ccfbf1',
    300: '#5eead4',
    500: '#14b8a6',
    600: '#0d9488',
    700: '#0f766e',
    900: '#134e4a',
  },
  sand: {
    50: '#fdfaf3',
    200: '#f1e5cd',
    500: '#cfa961',
  },
  text: {
    primary: '#0f172a',
    secondary: '#475569',
    muted: '#94a3b8',
    inverse: '#ffffff',
  },
  surface: {
    background: '#ffffff',
    subtle: '#f8fafc',
    border: '#e2e8f0',
  },
  status: {
    success: '#16a34a',
    warning: '#d97706',
    danger: '#dc2626',
  },
} as const;

/** Échelle d'espacement de base 4. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 6,
  md: 12,
  lg: 16,
  full: 999,
} as const;

export const typography = {
  h1: { fontSize: 28, fontWeight: '700' },
  h2: { fontSize: 22, fontWeight: '600' },
  h3: { fontSize: 18, fontWeight: '600' },
  body: { fontSize: 15, fontWeight: '400' },
  caption: { fontSize: 13, fontWeight: '400' },
} as const;
