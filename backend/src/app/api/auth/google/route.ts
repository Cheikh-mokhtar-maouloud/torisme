import { googleAuthSchema } from '@tourism/shared/validation';

import { ok } from '@/lib/api-response';
import { setRefreshCookie } from '@/lib/auth/refresh-cookie';
import { setSessionCookie } from '@/lib/auth/session';
import { parseBody, withRoute } from '@/lib/handler';
import { loginWithGoogle } from '@/services/auth.service';

/** POST /api/auth/google */
export const POST = withRoute(async (request) => {
  const { idToken } = await parseBody(request, googleAuthSchema);
  const result = await loginWithGoogle(idToken, request.headers.get('user-agent') ?? undefined);

  const response = ok(result);
  setSessionCookie(response, result.token);
  setRefreshCookie(response, result.refreshToken);
  return response;
});
