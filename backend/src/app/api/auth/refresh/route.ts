import { z } from 'zod';

import { ok } from '@/lib/api-response';
import { readRefreshToken, setRefreshCookie } from '@/lib/auth/refresh-cookie';
import { setSessionCookie } from '@/lib/auth/session';
import { HttpError } from '@/lib/errors';
import { withRoute } from '@/lib/handler';
import { refresh } from '@/services/auth.service';

const bodySchema = z.object({ refreshToken: z.string().min(1).optional() });

/**
 * POST /api/auth/refresh
 *
 * Échange un jeton de rafraîchissement contre un nouveau couple de jetons.
 * Le jeton présenté est consommé : la rotation est systématique.
 */
export const POST = withRoute(async (request) => {
  // Le corps est facultatif : le dashboard s'appuie sur le cookie.
  let bodyToken: string | undefined;
  try {
    const raw = await request.json();
    bodyToken = bodySchema.parse(raw).refreshToken;
  } catch {
    bodyToken = undefined;
  }

  const token = readRefreshToken(request, bodyToken);
  if (!token) throw HttpError.unauthorized('Jeton de rafraîchissement manquant');

  const result = await refresh(token, request.headers.get('user-agent') ?? undefined);

  const response = ok(result);
  setSessionCookie(response, result.token);
  setRefreshCookie(response, result.refreshToken);
  return response;
});
