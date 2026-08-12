import mongoose from 'mongoose';

import { fail, ok } from '@/lib/api-response';
import { ErrorCode } from '@tourism/shared/constants';
import { connectToDatabase, getDatabaseState } from '@/lib/db';
import { logger, serializeError } from '@/lib/logger';
import { queuesEnabled } from '@/lib/queue';
import { getRedis, safeRedis } from '@/lib/redis';

/**
 * GET /api/health
 *
 * Deux niveaux, choisis par `?deep=true` :
 *
 * - **superficiel** (défaut) : le processus répond. C'est ce que doit interroger
 *   un load balancer — une base lente ne doit pas faire retirer du pool une
 *   instance parfaitement capable de servir du cache.
 * - **profond** : vérifie aussi MongoDB par un `ping`. Destiné à la supervision,
 *   qui doit distinguer « l'API répond » de « l'API fonctionne ».
 */
export const dynamic = 'force-dynamic';

interface RedisProbe {
  configured: boolean;
  reachable: boolean;
  latencyMs?: number;
  queues: boolean;
}

async function probeRedis(): Promise<RedisProbe> {
  const client = getRedis();
  if (!client) return { configured: false, reachable: false, queues: false };

  const startedAt = Date.now();
  const pong = await safeRedis(async (redis) => redis.ping(), null);

  return {
    configured: true,
    reachable: pong === 'PONG',
    ...(pong === 'PONG' ? { latencyMs: Date.now() - startedAt } : {}),
    queues: queuesEnabled(),
  };
}

export async function GET(request: Request) {
  const deep = new URL(request.url).searchParams.get('deep') === 'true';

  const base = {
    status: 'ok' as const,
    service: 'tourism-backend',
    environment: process.env.APP_ENV ?? 'development',
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  };

  if (!deep) return ok(base);

  try {
    await connectToDatabase();
    const admin = mongoose.connection.db?.admin();
    const startedAt = Date.now();
    await admin?.ping();

    return ok({
      ...base,
      dependencies: {
        mongodb: { state: getDatabaseState(), latencyMs: Date.now() - startedAt },
        /*
         * Redis est rapporté mais **ne conditionne pas le statut**. Il est
         * facultatif par construction : le cache se contourne, les files
         * s'exécutent en ligne. Répondre 503 parce qu'il est absent ferait
         * retirer du pool une instance parfaitement capable de servir le
         * trafic, transformant une dégradation en panne.
         */
        redis: await probeRedis(),
      },
    });
  } catch (error) {
    logger.error('health check failed', serializeError(error));
    // 503 et non 500 : le service est temporairement indisponible, pas cassé.
    return fail(ErrorCode.INTERNAL_ERROR, 'Dépendance indisponible', 503);
  }
}
