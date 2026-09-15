import { requireUser } from '@/lib/auth/current-user';
import { createLineLinkCode, LINK_CODE_MINUTES } from '@/lib/notify/line-link';
import { apiOk, withApi } from '@/lib/api/respond';

export const POST = withApi(async () => {
  const user = await requireUser();
  const { code, expiresAt } = await createLineLinkCode({ userId: user.id, role: 'authenticated' }, user.id);
  return apiOk({ code, expiresAt: expiresAt.toISOString(), expiresInMinutes: LINK_CODE_MINUTES });
});
