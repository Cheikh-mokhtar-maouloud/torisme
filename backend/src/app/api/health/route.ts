import { ok } from '@/lib/api-response';

/**
 * GET /api/health
 *
 * Sonde de disponibilité (load balancer, monitoring). Elle ne doit dépendre
 * d'aucun service externe : la vérification des dépendances critiques
 * (MongoDB, Redis) sera exposée séparément une fois ces services branchés,
 * afin qu'une base lente ne fasse pas retirer l'instance du pool.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  return ok({
    status: 'ok',
    service: 'tourism-backend',
    environment: process.env.APP_ENV ?? 'development',
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
}
