import path from 'node:path';

import type { NextConfig } from 'next';

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
  transpilePackages: ['@tourism/shared'],
};

export default nextConfig;
