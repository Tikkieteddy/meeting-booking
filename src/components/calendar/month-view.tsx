'use client';

import type { CalendarBooking, MonthDaySummary } from '@/lib/domain/calendar-shared';
import { OCCUPANCY_META } from '@/lib/domain/booking-rules';
import { cx } from '@/components/ui/primitives';
import { t } from '@/lib/i18n';
import { thaiWeekday, toDateISO, weekdayOfISO } from '@/lib/util/time';
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

  const firstBookingTitle = (dateISO: string) =>
    bookings.find((b) => toDateISO(new Date(b.startsAt), TZ) === dateISO)?.title ?? null;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="grid shrink-0 grid-cols-7 border-b border-ink-200 bg-white">
        {weekdayHeader.map((wd) => (
          <div key={wd} className="px-1 py-2 text-center text-[11px] font-semibold text-ink-500">
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
          const sample = firstBookingTitle(day.dateISO);

          return (
            <button
              key={day.dateISO}
              type="button"
              onClick={() => onPickDay(day.dateISO)}
              aria-label={`${day.dateISO} ${t(meta.labelKey)} ${day.bookingCount > 0 ? t('calendar.bookingCountOne', { count: day.bookingCount }) : ''}${day.holidayName ? ` ${t('calendar.holiday')}: ${day.holidayName}` : ''}`}
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
                  <span aria-hidden="true" className="text-[10px]">
                    🎌
                  </span>
                )}
              </span>

              {/* จุดสีบอกสถานะ + ข้อความกำกับ (ห้ามสื่อด้วยสีอย่างเดียว) */}
              <span className="flex items-center gap-1 text-[10px] font-medium">
                <span aria-hidden="true" style={{ color: meta.color }}>
                  {meta.symbol}
                </span>
                <span className={outside ? 'text-ink-400' : 'text-ink-600'}>{t(meta.labelKey)}</span>
              </span>

              {day.bookingCount > 0 && (
                <>
                  <span className="text-[10px] text-ink-500">{t('calendar.bookingCountOne', { count: day.bookingCount })}</span>
                  {sample && <span className="w-full truncate text-[10px] text-ink-600">{sample}</span>}
                </>
              )}
            </button>
          );
        })}
      </div>

      {/* คำอธิบายจุดสี */}
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-t border-ink-200 bg-white px-3 py-2 text-[11px] text-ink-600">
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
