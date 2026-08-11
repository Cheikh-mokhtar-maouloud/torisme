import { loginSchema } from '@tourism/shared/validation';

import { ok } from '@/lib/api-response';
import { setSessionCookie } from '@/lib/auth/session';
import { parseBody, withRoute } from '@/lib/handler';
import { login } from '@/services/auth.service';

/** POST /api/auth/login */
export const POST = withRoute(async (request) => {
  const input = await parseBody(request, loginSchema);
  const result = await login(input);

  const response = ok(result);
  setSessionCookie(response, result.token);
  return response;
});
