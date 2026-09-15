import { cookies } from 'next/headers';
import { SESSION_COOKIE, revokeAllSessions } from '@/lib/auth/session';
import { requireUser } from '@/lib/auth/current-user';
import { apiOk, withApi } from '@/lib/api/respond';
import { auditStandalone } from '@/lib/audit';

export const POST = withApi(async () => {
  const user = await requireUser();
  const count = await revokeAllSessions(user.id);
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  await auditStandalone({
    actorProfileId: user.id,
    actorEmail: user.email,
    action: 'auth.logout_all_devices',
    resourceType: 'auth',
    resourceId: user.id,
    after: { revokedSessions: count },
  });
  return apiOk({ revoked: count });
});
