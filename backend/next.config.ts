import path from 'node:path';

import type { NextConfig } from 'next';

const isProduction = process.env.NODE_ENV === 'production';

/**
 * En-têtes de sécurité appliqués à toutes les réponses.
 * Le backend ne sert que du JSON : on interdit tout rendu et toute indexation.
 */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  // Aucune ressource n'est chargée par une API JSON : la CSP la plus stricte
  // possible est donc sans coût, et bloque l'exploitation d'une réponse
  // interprétée à tort comme du HTML.
  { key: 'Content-Security-Policy', value: "default-src 'none'; frame-ancestors 'none'" },
];

/**
 * HSTS : uniquement en production.
 *
 * Les navigateurs ignorent cet en-tête reçu sur une connexion non chiffrée,
 * il serait donc sans effet en développement. Il reste conditionné pour deux
 * raisons : ne pas laisser croire qu'une protection s'applique là où elle ne
 * s'applique pas, et éviter d'épingler `localhost` en HTTPS pour deux ans si le
 * poste sert un jour l'application derrière un certificat local.
 */
const productionHeaders = [
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  /*
   * Sortie autonome : Next produit un `server.js` accompagné des seules
   * dépendances réellement atteintes par le code. L'image finale n'embarque
   * alors ni `node_modules` complet ni sources — quelques dizaines de méga-octets
   * au lieu de plus d'un giga-octet, et surtout une surface d'attaque réduite à
   * ce qui sert vraiment.
   */
  output: 'standalone',
  /*
   * La racine du monorepo, et non le workspace. Sans cette indication, Next
   * cherche le `package-lock.json` le plus proche, conclut que la racine du
   * projet est le workspace lui-même, et omet les paquets hissés à la racine —
   * l'image démarre puis échoue au premier `require` manquant.
   */
  outputFileTracingRoot: path.join(import.meta.dirname, '..'),
  // Le paquet partagé est distribué en TypeScript source : Next doit le compiler.
  transpilePackages: ['@tourism/shared'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: isProduction ? [...securityHeaders, ...productionHeaders] : securityHeaders,
      },
    ];
  },
};

export default nextConfig;
