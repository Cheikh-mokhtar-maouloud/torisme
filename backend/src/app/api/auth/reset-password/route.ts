import { resetPasswordSchema } from '@tourism/shared/validation';

import { ok } from '@/lib/api-response';
import { parseBody, withRoute } from '@/lib/handler';
import { resetPassword } from '@/services/auth.service';

/** POST /api/auth/reset-password */
export const POST = withRoute(async (request) => {
  const { token, password } = await parseBody(request, resetPasswordSchema);
  await resetPassword(token, password);
  return ok({ message: 'Mot de passe réinitialisé. Vous pouvez vous connecter.' });
});
