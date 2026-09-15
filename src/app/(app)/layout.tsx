import { redirect } from 'next/navigation';
import { AppShell } from '@/components/layout/app-shell';
import { getSessionUser } from '@/lib/auth/current-user';
import { withTx } from '@/lib/db/pool';
import { highestRole, ROLES } from '@/lib/rbac/permissions';
import { t } from '@/lib/i18n';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  const unreadCount = await withTx({ userId: user.id, role: 'authenticated' }, async (sql) => {
    const res = await sql.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM in_app_notifications WHERE profile_id = $1 AND read_at IS NULL',
      [user.id],
    );
    return Number(res.rows[0]?.count ?? 0);
  });

  const role = highestRole(user.roles);

  return (
    <AppShell
      user={{
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        avatarUrl: user.avatarUrl,
        department: user.department,
        roleLabel: role ? ROLES[role].nameTh : t('role.employee'),
        permissions: user.permissions,
      }}
      unreadCount={unreadCount}
    >
      {children}
    </AppShell>
  );
}
