import type { NextConfig } from 'next';

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
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Le paquet partagé est distribué en TypeScript source : Next doit le compiler.
  transpilePackages: ['@tourism/shared'],
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
