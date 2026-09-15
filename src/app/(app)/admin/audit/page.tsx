import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/current-user';
import { searchAuditLogs } from '@/lib/domain/reports';
import { formatThaiDateShort, toTimeHHmm } from '@/lib/util/time';
import { t } from '@/lib/i18n';

export const metadata = { title: t('nav.auditLog') };
export const dynamic = 'force-dynamic';

/**
 * บันทึกการใช้งาน (บรีฟข้อ 11)
 * หน้านี้อ่านได้เท่านั้น — ตาราง audit_logs ไม่มี policy สำหรับ UPDATE/DELETE
 * จึงแก้ไขหรือลบจากหน้า Admin ไม่ได้เลย
 */
export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ actor?: string; action?: string; resourceId?: string; from?: string; to?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (!user.permissions.includes('audit:read')) redirect('/calendar');

  const params = await searchParams;
  const logs = await searchAuditLogs(
    { userId: user.id, role: 'authenticated' },
    {
      actor: params.actor ?? null,
      action: params.action ?? null,
      resourceId: params.resourceId ?? null,
      fromISO: /^\d{4}-\d{2}-\d{2}$/.test(params.from ?? '') ? params.from! : null,
      toISO: /^\d{4}-\d{2}-\d{2}$/.test(params.to ?? '') ? params.to! : null,
      limit: 200,
    },
  );

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 overflow-y-auto p-4 sm:p-6">
      <header>
        <h1 className="text-lg font-semibold text-ink-900">{t('audit.title')}</h1>
        <p className="text-sm text-ink-500">อ่านได้เท่านั้น ระบบไม่อนุญาตให้แก้ไขหรือลบบันทึกย้อนหลัง</p>
      </header>

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-2xl border border-ink-200 bg-white p-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-ink-700">{t('audit.actor')} (อีเมล)</span>
          <input name="actor" defaultValue={params.actor ?? ''} className="rounded-xl border border-ink-200 px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-ink-700">{t('audit.action')}</span>
          <input
            name="action"
            defaultValue={params.action ?? ''}
            placeholder="เช่น booking.create"
            className="rounded-xl border border-ink-200 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-ink-700">ตั้งแต่</span>
          <input type="date" name="from" defaultValue={params.from ?? ''} className="rounded-xl border border-ink-200 px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-ink-700">ถึง</span>
          <input type="date" name="to" defaultValue={params.to ?? ''} className="rounded-xl border border-ink-200 px-3 py-2" />
        </label>
        <button type="submit" className="h-11 rounded-xl bg-ink-800 px-4 text-sm font-medium text-white">
          {t('common.search')}
        </button>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-ink-200 bg-white">
        <table className="w-full min-w-[52rem] text-sm">
          <caption className="sr-only">บันทึกการใช้งานระบบ</caption>
          <thead className="bg-ink-50 text-xs text-ink-500">
            <tr>
              <th scope="col" className="px-3 py-2 text-start">{t('audit.at')}</th>
              <th scope="col" className="px-3 py-2 text-start">{t('audit.actor')}</th>
              <th scope="col" className="px-3 py-2 text-start">{t('audit.action')}</th>
              <th scope="col" className="px-3 py-2 text-start">{t('audit.resource')}</th>
              <th scope="col" className="px-3 py-2 text-start">IP</th>
              <th scope="col" className="px-3 py-2 text-start">{t('audit.correlationId')}</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-ink-500">
                  ไม่พบบันทึกตามเงื่อนไขที่เลือก
                </td>
              </tr>
            )}
            {logs.map((log) => (
              <tr key={log.id} className="border-t border-ink-100 align-top">
                <td className="whitespace-nowrap px-3 py-2 text-xs tabular-nums text-ink-600">
                  {formatThaiDateShort(log.createdAt.slice(0, 10))} {toTimeHHmm(new Date(log.createdAt))}
                </td>
                <td className="px-3 py-2 text-xs text-ink-700">{log.actorEmail ?? 'ระบบ'}</td>
                <td className="px-3 py-2">
                  <code className="rounded bg-ink-100 px-1.5 py-0.5 text-xs">{log.action}</code>
                </td>
                <td className="px-3 py-2 text-xs text-ink-600">
                  {log.resourceType}
                  {log.resourceId ? ` · ${log.resourceId.slice(0, 8)}…` : ''}
                  {Boolean(log.before ?? log.after) && (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-[11px] text-brand-700">ดูค่าเดิม/ค่าใหม่</summary>
                      <pre className="mt-1 max-w-md overflow-x-auto rounded bg-ink-50 p-2 text-[10px] leading-relaxed">
                        {String(JSON.stringify({ before: log.before, after: log.after }, null, 2))}
                      </pre>
                    </details>
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-ink-500">{log.ipHint ?? '-'}</td>
                <td className="px-3 py-2 text-[10px] text-ink-400">{log.correlationId?.slice(0, 8) ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
