import { requireUser } from '@/lib/auth/current-user';
import { unlinkLine } from '@/lib/notify/line-link';
import { auditStandalone } from '@/lib/audit';
import { apiOk, withApi } from '@/lib/api/respond';

export const POST = withApi(async () => {
  const user = await requireUser();
  await unlinkLine({ userId: user.id, role: 'authenticated' }, user.id);
  await auditStandalone({
    actorProfileId: user.id,
    actorEmail: user.email,
    action: 'line.unlink',
    resourceType: 'notification',
    resourceId: user.id,
  });
  return apiOk({ ok: true });
});
