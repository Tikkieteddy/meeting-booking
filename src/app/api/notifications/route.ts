import { withTx } from '@/lib/db/pool';
import { requireUser } from '@/lib/auth/current-user';
import { apiOk, withApi } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

export const GET = withApi(async (request: Request) => {
  const user = await requireUser();
  const unreadOnly = new URL(request.url).searchParams.get('unread') === 'true';
  const rows = await withTx({ userId: user.id, role: 'authenticated' }, async (sql) => {
    const res = await sql.query<{
      id: string;
      event_type: string;
      title: string;
      body: string | null;
      link: string | null;
      booking_id: string | null;
      read_at: Date | null;
      created_at: Date;
    }>(
      `SELECT id, event_type, title, body, link, booking_id, read_at, created_at
         FROM in_app_notifications
        WHERE profile_id = $1 ${unreadOnly ? 'AND read_at IS NULL' : ''}
        ORDER BY created_at DESC LIMIT 100`,
      [user.id],
    );
    return res.rows;
  });

  return apiOk({
    notifications: rows.map((r) => ({
      id: r.id,
      eventType: r.event_type,
      title: r.title,
      body: r.body,
      link: r.link,
      bookingId: r.booking_id,
      readAt: r.read_at?.toISOString() ?? null,
      createdAt: r.created_at.toISOString(),
    })),
  });
});
