import { cookies } from 'next/headers';
import { SESSION_COOKIE, revokeSession } from '@/lib/auth/session';
import { apiOk, withApi } from '@/lib/api/respond';

export const POST = withApi(async () => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await revokeSession(token);
  store.delete(SESSION_COOKIE);
  return apiOk({ ok: true });
});
