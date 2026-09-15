import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/current-user';
import { withTx } from '@/lib/db/pool';
import { NotificationCenter } from '@/components/layout/notification-center';
import { t } from '@/lib/i18n';

export const metadata = { title: t('notify.center') };
export const dynamic = 'force-dynamic';

export default async function NotificationsPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  const notifications = await withTx({ userId: user.id, role: 'authenticated' }, async (sql) => {
    const res = await sql.query<{
      id: string;
      event_type: string;
      title: string;
      body: string | null;
      link: string | null;
      read_at: Date | null;
      created_at: Date;
    }>(
      `SELECT id, event_type, title, body, link, read_at, created_at
         FROM in_app_notifications WHERE profile_id = $1 ORDER BY created_at DESC LIMIT 100`,
      [user.id],
    );
    return res.rows.map((r) => ({
      id: r.id,
      eventType: r.event_type,
      title: r.title,
      body: r.body,
      link: r.link,
      readAt: r.read_at?.toISOString() ?? null,
      createdAt: r.created_at.toISOString(),
    }));
  });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 overflow-y-auto p-4 sm:p-6">
      <NotificationCenter initial={notifications} />
    </div>
  );
}
