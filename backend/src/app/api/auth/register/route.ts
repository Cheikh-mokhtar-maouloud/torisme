import { registerSchema } from '@tourism/shared/validation';

import { created } from '@/lib/api-response';
import { setRefreshCookie } from '@/lib/auth/refresh-cookie';
import { setSessionCookie } from '@/lib/auth/session';
import { parseBody, withRoute } from '@/lib/handler';
import { register } from '@/services/auth.service';

/** POST /api/auth/register — création d'un compte utilisateur. */
export const POST = withRoute(async (request) => {
  const input = await parseBody(request, registerSchema);
  const result = await register(input, request.headers.get('user-agent') ?? undefined);

  // Le jeton est renvoyé dans le corps (consommé par le mobile) et posé en
  // cookie HTTP-only (consommé par le dashboard). Voir lib/auth/session.ts.
  const response = created(result);
  setSessionCookie(response, result.token);
  setRefreshCookie(response, result.refreshToken);
  return response;
});
