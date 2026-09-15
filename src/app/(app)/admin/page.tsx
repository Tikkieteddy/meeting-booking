import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/current-user';
import { getDashboard } from '@/lib/domain/reports';
import { listRooms } from '@/lib/domain/rooms';
import { addDaysISO, toDateISO, formatThaiDate } from '@/lib/util/time';
import { t } from '@/lib/i18n';

export const metadata = { title: t('admin.dashboard') };
export const dynamic = 'force-dynamic';

export default async function AdminDashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (!user.permissions.includes('report:read')) redirect('/calendar');
  const ctx = { userId: user.id, role: 'authenticated' as const };

  const todayISO = toDateISO(new Date(), user.timezone);
  const fromISO = addDaysISO(todayISO, -29);
  const [summary, rooms] = await Promise.all([
    getDashboard(ctx, { fromISO, toISO: todayISO }),
    listRooms(ctx, { includeArchived: true, includeInactive: true }),
  ]);

  const checklist = [
    { label: 'ตั้งค่าองค์กรและเวลาทำการ', done: rooms.length > 0, href: '/admin/rooms' },
    { label: 'เพิ่มห้องประชุมอย่างน้อย 1 ห้อง', done: rooms.some((r) => r.archivedAt === null), href: '/admin/rooms' },
    { label: 'กำหนดผู้อนุมัติให้ห้องที่ต้องขออนุมัติ', done: rooms.some((r) => r.policy.requiresApproval), href: '/admin/rooms' },
    { label: 'เชิญผู้ใช้เข้าระบบ', done: true, href: '/admin/users' },
    { label: 'ทดสอบการแจ้งเตือน (ดูสถานะคิวงาน)', done: true, href: '/admin/system' },
  ];

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 overflow-y-auto p-4 sm:p-6">
      <header>
        <h1 className="text-lg font-semibold text-ink-900">{t('admin.dashboard')}</h1>
        <p className="text-sm text-ink-500">
          ข้อมูล 30 วันล่าสุด · {formatThaiDate(fromISO)} ถึง {formatThaiDate(todayISO)}
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t('admin.totalBookings')} value={summary.totalBookings.toLocaleString('th-TH')} />
        <Stat label={t('admin.utilization')} value={`${summary.utilizationPercent}%`} />
        <Stat label={t('admin.usageHours')} value={`${summary.totalHours.toLocaleString('th-TH')} ชม.`} />
        <Stat
          label={t('admin.peakTime')}
          value={summary.peakHour !== null ? `${String(summary.peakHour).padStart(2, '0')}:00` : '-'}
        />
        <Stat label={t('admin.cancellations')} value={summary.cancelledBookings.toLocaleString('th-TH')} />
        <Stat label={t('admin.noShows')} value={summary.noShowBookings.toLocaleString('th-TH')} />
        <Stat label={t('status.pending')} value={summary.pendingApprovals.toLocaleString('th-TH')} href="/approvals" />
        <Stat label="ห้องที่เปิดใช้" value={String(rooms.filter((r) => r.isActive && !r.archivedAt).length)} href="/admin/rooms" />
      </div>

      <section className="rounded-2xl border border-ink-200 bg-white p-4">
        <h2 className="mb-3 text-base font-semibold text-ink-800">{t('admin.popularRooms')}</h2>
        {summary.topRooms.length === 0 ? (
          <p className="text-sm text-ink-500">ยังไม่มีข้อมูลการใช้ห้องในช่วงนี้</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {summary.topRooms.map((room) => {
              const max = summary.topRooms[0]?.bookings || 1;
              return (
                <li key={room.roomId} className="flex items-center gap-3">
                  <span className="w-40 shrink-0 truncate text-sm text-ink-700">{room.roomName}</span>
                  <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-ink-100">
                    <span
                      className="block h-full rounded-full bg-brand-500"
                      style={{ width: `${Math.round((room.bookings / max) * 100)}%` }}
                    />
                  </span>
                  <span className="w-28 shrink-0 text-end text-xs tabular-nums text-ink-600">
                    {room.bookings} ครั้ง · {room.hours} ชม.
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-ink-200 bg-white p-4">
        <h2 className="mb-3 text-base font-semibold text-ink-800">{t('admin.checklist')}</h2>
        <ul className="flex flex-col gap-2">
          {checklist.map((item) => (
            <li key={item.label} className="flex items-center gap-2 text-sm">
              <span aria-hidden="true" className={item.done ? 'text-emerald-600' : 'text-ink-300'}>
                {item.done ? '✓' : '○'}
              </span>
              <Link href={item.href} className="text-ink-700 underline-offset-2 hover:underline">
                {item.label}
              </Link>
              <span className="sr-only">{item.done ? 'ทำแล้ว' : 'ยังไม่ทำ'}</span>
            </li>
          ))}
        </ul>
      </section>

      <nav className="flex flex-wrap gap-2">
        {[
          { href: '/admin/reports', label: t('nav.reports') },
          { href: '/admin/users', label: t('nav.users') },
          { href: '/admin/audit', label: t('nav.auditLog') },
          { href: '/admin/system', label: t('nav.systemHealth') },
        ].map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="rounded-xl border border-ink-200 bg-white px-4 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50"
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

function Stat({ label, value, href }: { label: string; value: string; href?: string }) {
  const content = (
    <div className="rounded-2xl border border-ink-200 bg-white p-4">
      <p className="text-xs text-ink-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-ink-900">{value}</p>
    </div>
  );
  return href ? (
    <Link href={href} className="block transition-shadow hover:shadow-soft">
      {content}
    </Link>
  ) : (
    content
  );
}
