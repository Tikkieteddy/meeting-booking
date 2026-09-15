import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/current-user';
import { listPendingApprovals } from '@/lib/domain/search';
import { ApprovalQueue } from '@/components/booking/approval-queue';
import { t } from '@/lib/i18n';

export const metadata = { title: t('approval.queue') };
export const dynamic = 'force-dynamic';

export default async function ApprovalsPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (!user.permissions.includes('booking:approve')) redirect('/calendar');

  const items = await listPendingApprovals({ userId: user.id, role: 'authenticated' });

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 overflow-y-auto p-4 sm:p-6">
      <h1 className="text-lg font-semibold text-ink-900">{t('approval.queue')}</h1>
      <ApprovalQueue items={items} />
    </div>
  );
}
