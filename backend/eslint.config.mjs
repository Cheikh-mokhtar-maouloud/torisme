import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Les logs passent par src/lib/logger.ts, jamais par console directement.
      'no-console': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      // Le préfixe `_` marque un paramètre imposé par une signature externe
      // (server actions, gestionnaires de route) mais volontairement inutilisé.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Les scripts s'exécutent au terminal : leur sortie console est leur raison
    // d'être, pas un oubli de débogage.
    files: ['scripts/**'],
    rules: { 'no-console': 'off' },
  },
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // Sortie d'esbuild : du code généré, jamais relu ni modifié à la main.
    // L'analyser reviendrait à signaler les choix du bundler comme des défauts.
    'dist-ops/**',
  ]),
]);

export default eslintConfig;
