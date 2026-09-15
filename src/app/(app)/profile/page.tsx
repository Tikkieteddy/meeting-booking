import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/current-user';
import { withTx } from '@/lib/db/pool';
import { ProfileForm } from '@/components/layout/profile-form';
import { highestRole, ROLES } from '@/lib/rbac/permissions';
import { t } from '@/lib/i18n';

export const metadata = { title: t('nav.profile') };
export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const ctx = { userId: user.id, role: 'authenticated' as const };

  const { preferences, lineLink } = await withTx(ctx, async (sql) => {
    const prefRes = await sql.query<{
      email_enabled: boolean;
      line_enabled: boolean;
      in_app_enabled: boolean;
      reminder_leads: number[];
    }>('SELECT email_enabled, line_enabled, in_app_enabled, reminder_leads FROM notification_preferences WHERE profile_id = $1', [
      user.id,
    ]);
    const linkRes = await sql.query<{ status: string; linked_at: Date | null }>(
      'SELECT status, linked_at FROM line_links WHERE profile_id = $1',
      [user.id],
    );
    const p = prefRes.rows[0];
    return {
      preferences: {
        emailEnabled: p?.email_enabled ?? true,
        lineEnabled: p?.line_enabled ?? false,
        inAppEnabled: p?.in_app_enabled ?? true,
        reminderLeads: p?.reminder_leads ?? [1440, 15],
      },
      lineLink: linkRes.rows[0]
        ? { status: linkRes.rows[0].status, linkedAt: linkRes.rows[0].linked_at?.toISOString() ?? null }
        : null,
    };
  });

  const role = highestRole(user.roles);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 overflow-y-auto p-4 sm:p-6">
      <h1 className="text-lg font-semibold text-ink-900">{t('nav.profile')}</h1>
      <ProfileForm
        profile={{
          fullName: user.fullName,
          email: user.email,
          phone: user.phone,
          department: user.department,
          jobTitle: user.jobTitle,
          locale: user.locale,
          timezone: user.timezone,
          roleLabel: role ? ROLES[role].nameTh : t('role.employee'),
        }}
        preferences={preferences}
        lineLink={lineLink}
      />
    </div>
  );
}
