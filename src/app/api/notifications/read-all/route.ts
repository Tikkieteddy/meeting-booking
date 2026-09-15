import { withTx } from '@/lib/db/pool';
import { requireUser } from '@/lib/auth/current-user';
import { apiOk, withApi } from '@/lib/api/respond';

export const POST = withApi(async (request: Request) => {
  const user = await requireUser();
  const body = (await request.json().catch(() => ({}))) as { id?: string };
  const count = await withTx({ userId: user.id, role: 'authenticated' }, async (sql) => {
    const res = body.id
      ? await sql.query('UPDATE in_app_notifications SET read_at = now() WHERE profile_id = $1 AND id = $2 AND read_at IS NULL', [user.id, body.id])
      : await sql.query('UPDATE in_app_notifications SET read_at = now() WHERE profile_id = $1 AND read_at IS NULL', [user.id]);
    return res.rowCount;
  });
  return apiOk({ updated: count });
});
