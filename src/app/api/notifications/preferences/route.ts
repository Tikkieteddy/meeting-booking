import { withTx } from '@/lib/db/pool';
import { requireUser } from '@/lib/auth/current-user';
import { notificationPreferenceSchema } from '@/lib/validation/schemas';
import { apiOk, withApi } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

export const GET = withApi(async () => {
  const user = await requireUser();
  const prefs = await withTx({ userId: user.id, role: 'authenticated' }, async (sql) => {
    const res = await sql.query<{
      email_enabled: boolean;
      line_enabled: boolean;
      in_app_enabled: boolean;
      reminder_leads: number[];
    }>('SELECT email_enabled, line_enabled, in_app_enabled, reminder_leads FROM notification_preferences WHERE profile_id = $1', [
      user.id,
    ]);
    const row = res.rows[0];
    return {
      emailEnabled: row?.email_enabled ?? true,
      lineEnabled: row?.line_enabled ?? false,
      inAppEnabled: row?.in_app_enabled ?? true,
      reminderLeads: row?.reminder_leads ?? [1440, 15],
    };
  });

  const lineLink = await withTx({ userId: user.id, role: 'authenticated' }, async (sql) => {
    const res = await sql.query<{ status: string; linked_at: Date | null }>(
      'SELECT status, linked_at FROM line_links WHERE profile_id = $1',
      [user.id],
    );
    return res.rows[0] ? { status: res.rows[0].status, linkedAt: res.rows[0].linked_at?.toISOString() ?? null } : null;
  });

  return apiOk({ preferences: prefs, lineLink });
});

export const PUT = withApi(async (request: Request) => {
  const user = await requireUser();
  const input = notificationPreferenceSchema.parse(await request.json());
  await withTx({ userId: user.id, role: 'authenticated' }, (sql) =>
    sql.query(
      `INSERT INTO notification_preferences (profile_id, email_enabled, line_enabled, in_app_enabled, reminder_leads, updated_at)
       VALUES ($1,$2,$3,$4,$5,now())
       ON CONFLICT (profile_id) DO UPDATE
         SET email_enabled = excluded.email_enabled,
             line_enabled = excluded.line_enabled,
             in_app_enabled = excluded.in_app_enabled,
             reminder_leads = excluded.reminder_leads,
             updated_at = now()`,
      [user.id, input.emailEnabled, input.lineEnabled, input.inAppEnabled, input.reminderLeads],
    ),
  );
  return apiOk({ ok: true });
});
