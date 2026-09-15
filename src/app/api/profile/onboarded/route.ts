import { withTx } from '@/lib/db/pool';
import { requireUser } from '@/lib/auth/current-user';
import { apiOk, withApi } from '@/lib/api/respond';

export const POST = withApi(async () => {
  const user = await requireUser();
  await withTx({ userId: user.id, role: 'authenticated' }, (sql) =>
    sql.query('UPDATE profiles SET onboarded_at = coalesce(onboarded_at, now()) WHERE id = $1', [user.id]),
  );
  return apiOk({ ok: true });
});
