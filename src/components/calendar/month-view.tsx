'use client';

import type { CalendarBooking, MonthDaySummary } from '@/lib/domain/calendar-shared';
import { OCCUPANCY_META } from '@/lib/domain/booking-rules';
import { cx } from '@/components/ui/primitives';
import { t } from '@/lib/i18n';
import { formatTimeRange, thaiWeekday, toDateISO } from '@/lib/util/time';
import { TZ } from './shared';

/**
 * มุมมองรายเดือน (บรีฟข้อ 3.3)
 *  - แสดงจำนวนการจองต่อวัน และจุดสีบอกสถานะ 4 ระดับ
 *  - คลิกวันแล้วเปิดมุมมองรายวันของวันนั้น
 *  - วันนอกเดือนใช้สีจาง วันหยุดมีสัญลักษณ์และ tooltip
 *  - แสดงภาพรวม ไม่ยัดรายละเอียดทุกการจอง
 */
export function MonthView({
  monthDateISO,
  days,
  bookings,
  onPickDay,
}: {
  monthDateISO: string;
  days: MonthDaySummary[];
  bookings: CalendarBooking[];
  onPickDay: (dateISO: string) => void;
}) {
  const currentMonth = monthDateISO.slice(0, 7);
  const todayISO = toDateISO(new Date(), TZ);
  const weekdayHeader = [1, 2, 3, 4, 5, 6, 0];

  /*
   * ช่วงเวลาที่ถูกจองของแต่ละวัน เรียงตามเวลา — ผู้ใช้ขอให้เห็น "ช่วงเวลา" ในช่องวัน
   * ไม่ใช่แค่จำนวน จะได้กะได้ทันทีว่าวันนั้นเหลือช่วงไหนว่าง
   */
  const rangesByDay = new Map<string, { label: string; title: string | null }[]>();
  for (const b of [...bookings].sort((a, z) => a.startsAt.localeCompare(z.startsAt))) {
    if (b.status === 'cancelled' || b.status === 'rejected') continue;
    const dateISO = toDateISO(new Date(b.startsAt), TZ);
    const list = rangesByDay.get(dateISO) ?? [];
    list.push({
      label: formatTimeRange(new Date(b.startsAt), new Date(b.endsAt), TZ),
      title: b.canSeeDetails ? b.title : null,
    });
    rangesByDay.set(dateISO, list);
  }
  const MAX_RANGES = 3;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="grid shrink-0 grid-cols-7 border-b border-ink-200 bg-white">
        {weekdayHeader.map((wd) => (
          <div key={wd} className="px-1 py-2 text-center text-[0.6875rem] font-semibold text-ink-500">
            <span className="hidden sm:inline">{thaiWeekday(wd)}</span>
            <span className="sm:hidden">{thaiWeekday(wd, true)}</span>
          </div>
        ))}
      </div>

      <div className="calendar-scroll grid flex-1 auto-rows-fr grid-cols-7 overflow-y-auto">
        {days.map((day) => {
          const outside = !day.dateISO.startsWith(currentMonth);
          const isToday = day.dateISO === todayISO;
          const meta = OCCUPANCY_META[day.occupancy];
          const dayNumber = Number(day.dateISO.slice(8, 10));
          const ranges = rangesByDay.get(day.dateISO) ?? [];
          const busyDay = day.occupancy === 'full';

          return (
            <button
              key={day.dateISO}
              type="button"
              onClick={() => onPickDay(day.dateISO)}
              aria-label={`${day.dateISO} ${busyDay ? t('calendar.busyDay') : t(meta.labelKey)} ${day.bookingCount > 0 ? t('calendar.bookingCountOne', { count: day.bookingCount }) : ''}${ranges.length > 0 ? ` ${ranges.map((r) => r.label).join(', ')}` : ''}${day.holidayName ? ` ${t('calendar.holiday')}: ${day.holidayName}` : ''}`}
              title={day.holidayName ?? undefined}
              className={cx(
                'flex min-h-20 flex-col items-start gap-1 border-b border-e border-ink-100 p-1.5 text-start transition-colors',
                'hover:bg-brand-50/60 focus-visible:bg-brand-50',
                outside && 'bg-ink-50/60 text-ink-400',
                isToday && 'ring-2 ring-inset ring-brand-400',
              )}
            >
              <span className="flex w-full items-center justify-between">
                <span
                  className={cx(
                    'text-sm font-semibold tabular-nums',
                    isToday && 'flex size-6 items-center justify-center rounded-full bg-brand-500 text-white',
                    outside && 'font-normal',
                  )}
                >
                  {dayNumber}
                </span>
                {day.holidayName && (
                  <span aria-hidden="true" className="text-[0.625rem]">
                    🎌
                  </span>
                )}
              </span>

              {/* สถานะวัน: เต็ม = ป้ายแดง "ไม่ว่าง" (พื้นแดงเข้ม+ตัวขาว ผ่าน WCAG AA และมีสัญลักษณ์กำกับ) */}
              {busyDay ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-1.5 py-0.5 text-[0.625rem] font-semibold text-white">
                  <span aria-hidden="true">●</span>
                  {t('calendar.busyDay')}
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[0.625rem] font-medium">
                  <span aria-hidden="true" style={{ color: meta.color }}>
                    {meta.symbol}
                  </span>
                  <span className={outside ? 'text-ink-400' : 'text-ink-600'}>{t(meta.labelKey)}</span>
                </span>
              )}

              {/* ช่วงเวลาที่ถูกจองในวันนั้น (สูงสุด 3 ช่วง ที่เหลือบอกเป็น +N) */}
              {ranges.length > 0 && (
                <span className="flex w-full flex-col gap-0.5">
                  {ranges.slice(0, MAX_RANGES).map((r, i) => (
                    <span
                      key={i}
                      className={cx('w-full truncate text-[0.625rem] tabular-nums', busyDay ? 'text-red-700' : 'text-ink-700')}
                      title={r.title ?? undefined}
                    >
                      {r.label}
                      {r.title && <span className="text-ink-500"> {r.title}</span>}
                    </span>
                  ))}
                  {ranges.length > MAX_RANGES && (
                    <span className="text-[0.625rem] text-ink-500">+{ranges.length - MAX_RANGES}</span>
                  )}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* คำอธิบายจุดสี */}
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-t border-ink-200 bg-white px-3 py-2 text-[0.6875rem] text-ink-600">
        {(['free', 'partial', 'almost', 'full'] as const).map((level) => (
          <span key={level} className="flex items-center gap-1">
            <span aria-hidden="true" style={{ color: OCCUPANCY_META[level].color }}>
              {OCCUPANCY_META[level].symbol}
            </span>
            <span>{t(OCCUPANCY_META[level].labelKey)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
