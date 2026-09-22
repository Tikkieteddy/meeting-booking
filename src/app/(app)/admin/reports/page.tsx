import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/current-user';
import { getDashboard, getBookingReport } from '@/lib/domain/reports';
import { listRooms } from '@/lib/domain/rooms';
import { StatusBadge } from '@/components/ui/primitives';
import { addDaysISO, formatThaiDate, toDateISO, toTimeHHmm } from '@/lib/util/time';
import { t } from '@/lib/i18n';

export const metadata = { title: t('nav.reports') };
export const dynamic = 'force-dynamic';

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; roomId?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (!user.permissions.includes('report:read')) redirect('/calendar');

  const params = await searchParams;
  const todayISO = toDateISO(new Date(), user.timezone);
  const toISO = /^\d{4}-\d{2}-\d{2}$/.test(params.to ?? '') ? params.to! : todayISO;
  const fromISO = /^\d{4}-\d{2}-\d{2}$/.test(params.from ?? '') ? params.from! : addDaysISO(toISO, -29);
  const ctx = { userId: user.id, role: 'authenticated' as const };
  const rooms = await listRooms(ctx, { includeArchived: true, includeInactive: true });
  const roomId = params.roomId && rooms.some((r) => r.id === params.roomId) ? params.roomId : null;

  const [summary, report] = await Promise.all([
    getDashboard(ctx, { fromISO, toISO, roomId }),
    getBookingReport(ctx, { fromISO, toISO, roomId }),
  ]);

  const exportParams = new URLSearchParams({ from: fromISO, to: toISO });
  if (roomId) exportParams.set('roomId', roomId);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 overflow-y-auto p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-ink-900">{t('nav.reports')}</h1>
          <p className="text-sm text-ink-500">
            {formatThaiDate(fromISO)} ถึง {formatThaiDate(toISO)}
          </p>
        </div>
        <a
          href={`/api/admin/reports/export?${exportParams.toString()}`}
          className="inline-flex h-11 items-center rounded-xl bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600"
        >
          {t('common.export')}
        </a>
      </header>

      {/* ตัวกรองแบบฟอร์ม GET — ทำงานได้แม้ JavaScript ปิด */}
      <form method="get" className="flex flex-wrap items-end gap-3 rounded-2xl border border-ink-200 bg-white p-4 no-print">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-ink-700">ตั้งแต่วันที่</span>
          <input type="date" name="from" defaultValue={fromISO} className="rounded-xl border border-ink-200 px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-ink-700">ถึงวันที่</span>
          <input type="date" name="to" defaultValue={toISO} className="rounded-xl border border-ink-200 px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-ink-700">{t('booking.room')}</span>
          <select name="roomId" defaultValue={roomId ?? ''} className="rounded-xl border border-ink-200 px-3 py-2">
            <option value="">{t('calendar.allRooms')}</option>
            {rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="h-11 rounded-xl bg-ink-800 px-4 text-sm font-medium text-white">
          ใช้ตัวกรอง
        </button>
      </form>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label={t('admin.totalBookings')} value={summary.totalBookings} />
        <Stat label={t('status.confirmed')} value={summary.confirmedBookings} />
        <Stat label={t('admin.cancellations')} value={summary.cancelledBookings} />
        <Stat label={t('admin.noShows')} value={summary.noShowBookings} />
        <Stat label={t('admin.usageHours')} value={summary.totalHours} suffix=" ชม." />
        <Stat label={t('admin.utilization')} value={summary.utilizationPercent} suffix="%" />
      </div>

      <section className="rounded-2xl border border-ink-200 bg-white p-4">
        <h2 className="mb-3 text-base font-semibold text-ink-800">การจองรายวัน</h2>
        {summary.byDay.length === 0 ? (
          <p className="text-sm text-ink-500">ไม่มีข้อมูลในช่วงที่เลือก</p>
        ) : (
          <div className="flex h-40 items-end gap-1 overflow-x-auto">
            {summary.byDay.map((day) => {
              const max = Math.max(...summary.byDay.map((d) => d.bookings), 1);
              return (
                <div key={day.dateISO} className="flex min-w-6 flex-1 flex-col items-center gap-1">
                  <span className="text-[0.625rem] tabular-nums text-ink-500">{day.bookings || ''}</span>
                  <span
                    className="w-full rounded-t bg-brand-400"
                    style={{ height: `${Math.round((day.bookings / max) * 100)}%`, minHeight: day.bookings ? 4 : 0 }}
                    title={`${day.dateISO}: ${day.bookings} รายการ`}
                  />
                  <span className="text-[0.5625rem] text-ink-400">{day.dateISO.slice(8)}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-ink-200 bg-white p-4">
        <h2 className="mb-3 text-base font-semibold text-ink-800">การจองแยกตามแผนก</h2>
        <ul className="flex flex-col gap-1.5 text-sm">
          {summary.byDepartment.map((row) => (
            <li key={row.department} className="flex justify-between gap-3">
              <span className="text-ink-700">{row.department}</span>
              <span className="tabular-nums text-ink-600">{row.bookings}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="overflow-x-auto rounded-2xl border border-ink-200 bg-white">
        <table className="w-full min-w-[48rem] text-sm">
          <caption className="px-3 py-2 text-start text-base font-semibold text-ink-800">
            รายการการจอง ({report.length.toLocaleString('th-TH')} รายการ)
          </caption>
          <thead className="bg-ink-50 text-xs text-ink-500">
            <tr>
              <th scope="col" className="px-3 py-2 text-start">วันที่</th>
              <th scope="col" className="px-3 py-2 text-start">เวลา</th>
              <th scope="col" className="px-3 py-2 text-start">ห้อง</th>
              <th scope="col" className="px-3 py-2 text-start">หัวข้อ</th>
              <th scope="col" className="px-3 py-2 text-start">ผู้จอง</th>
              <th scope="col" className="px-3 py-2 text-start">แผนก</th>
              <th scope="col" className="px-3 py-2 text-end">ชม.</th>
              <th scope="col" className="px-3 py-2 text-start">สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {report.slice(0, 300).map((row) => (
              <tr key={row.id} className="border-t border-ink-100">
                <td className="whitespace-nowrap px-3 py-2">{formatThaiDate(row.startsAt.slice(0, 10))}</td>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                  {toTimeHHmm(new Date(row.startsAt))}–{toTimeHHmm(new Date(row.endsAt))}
                </td>
                <td className="px-3 py-2">{row.roomName}</td>
                <td className="px-3 py-2">{row.title}</td>
                <td className="px-3 py-2">{row.bookerName}</td>
                <td className="px-3 py-2">{row.department ?? '-'}</td>
                <td className="px-3 py-2 text-end tabular-nums">{row.hours}</td>
                <td className="px-3 py-2">
                  <StatusBadge status={row.status} label={t(`status.${row.status}` as 'status.confirmed')} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {report.length > 300 && (
          <p className="px-3 py-2 text-xs text-ink-500">แสดง 300 รายการแรก — ดาวน์โหลด CSV เพื่อดูทั้งหมด</p>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, suffix = '' }: { label: string; value: number; suffix?: string }) {
  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-3">
      <p className="text-xs text-ink-500">{label}</p>
      <p className="mt-0.5 text-xl font-semibold tabular-nums text-ink-900">
        {value.toLocaleString('th-TH')}
        {suffix}
      </p>
    </div>
  );
}
