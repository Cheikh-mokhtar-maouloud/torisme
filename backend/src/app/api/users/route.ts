import { userListQuerySchema } from '@tourism/shared/validation';

import { paginated } from '@/lib/api-response';
import { requireAdmin } from '@/lib/auth/guard';
import { parseQuery, withRoute } from '@/lib/handler';
import { listUsers } from '@/services/user.service';

/** GET /api/users — liste des comptes. Réservée aux administrateurs. */
export const GET = withRoute(async (request) => {
  await requireAdmin(request);
  const query = parseQuery(request, userListQuerySchema);
  const result = await listUsers(query);
  return paginated(result.items, result.meta);
});
