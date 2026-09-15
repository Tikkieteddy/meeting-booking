import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/current-user';
import { getSystemHealth } from '@/lib/domain/reports';
import { SystemHealthPanel } from '@/components/admin/system-health';
import { env } from '@/lib/env';
import { t } from '@/lib/i18n';

export const metadata = { title: t('nav.systemHealth') };
export const dynamic = 'force-dynamic';

export default async function AdminSystemPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (!user.permissions.includes('system:manage')) redirect('/calendar');

  const health = await getSystemHealth({ userId: user.id, role: 'authenticated' });
  const cfg = env();

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 overflow-y-auto p-4 sm:p-6">
      <header>
        <h1 className="text-lg font-semibold text-ink-900">{t('nav.systemHealth')}</h1>
        <p className="text-sm text-ink-500">
          แสดงสถานะการส่งอีเมล LINE และงานค้าง โดยไม่เปิดเผยค่า Secret ใด ๆ
        </p>
      </header>
      {/* แสดงเฉพาะ "ชื่อผู้ให้บริการ" ไม่ใช่คีย์ */}
      <SystemHealthPanel health={health} providers={{ email: cfg.EMAIL_PROVIDER, line: cfg.LINE_PROVIDER }} />
    </div>
  );
}
