import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/current-user';
import { listRoleSettings } from '@/lib/domain/roles-admin';
import { RoleManager } from '@/components/admin/role-manager';
import { t } from '@/lib/i18n';

export const metadata = { title: t('nav.roles') };
export const dynamic = 'force-dynamic';

export default async function AdminRolesPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (!user.permissions.includes('role:manage')) redirect('/calendar');

  const roles = await listRoleSettings({ userId: user.id, role: 'authenticated' });

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 overflow-y-auto p-4 sm:p-6">
      <header>
        <h1 className="text-lg font-semibold text-ink-900">{t('nav.roles')}</h1>
        <p className="mt-1 text-sm text-ink-500">{t('role.pageIntro')}</p>
      </header>
      <RoleManager roles={roles} />
    </div>
  );
}
