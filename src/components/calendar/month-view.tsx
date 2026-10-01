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
  const rangesByDay = new Map<string, { label: string; who: string | null }[]>();
  for (const b of [...bookings].sort((a, z) => a.startsAt.localeCompare(z.startsAt))) {
    if (b.status === 'cancelled' || b.status === 'rejected') continue;
    const dateISO = toDateISO(new Date(b.startsAt), TZ);
    const list = rangesByDay.get(dateISO) ?? [];
    // หลังเวลาแสดง "ชื่อผู้จอง" (ไม่ใช่ชื่อประชุม) ตามที่ผู้ใช้ขอ
    list.push({
      label: formatTimeRange(new Date(b.startsAt), new Date(b.endsAt), TZ),
      // เฉพาะชื่อต้น ไม่แสดงนามสกุล (ผู้ใช้ขอ 1 ต.ค. 2569) — ช่องวันแคบ และพอให้รู้ว่าใครจอง
      who: firstName(b.bookerName),
    });
    rangesByDay.set(dateISO, list);
  }
  const MAX_RANGES = 3;

  // อัตราใช้งานเดือนนี้ (แบบจาก Stitch): นาทีที่ถูกจอง ÷ นาทีที่ห้องเปิดให้จอง ของวันในเดือนนี้เท่านั้น
  const inMonth = days.filter((d) => d.dateISO.startsWith(currentMonth));
  const bookedMinutes = inMonth.reduce((sum, d) => sum + d.bookedMinutes, 0);
  const availableMinutes = inMonth.reduce((sum, d) => sum + d.availableMinutes, 0);
  const bookingTotal = inMonth.reduce((sum, d) => sum + d.bookingCount, 0);
  const utilization = availableMinutes > 0 ? Math.round((bookedMinutes / availableMinutes) * 1000) / 10 : 0;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <p className="flex shrink-0 flex-wrap items-center gap-x-2 px-3 pt-2 text-xs text-ink-800 sm:px-4">
        <span aria-hidden="true" className="size-2 rounded-full bg-accent" />
        {t('calendar.monthUtilization', { percent: utilization, count: bookingTotal })}
      </p>
      <div className="grid shrink-0 grid-cols-7 gap-1.5 px-2 pt-2 sm:px-3">
        {weekdayHeader.map((wd) => (
          <div key={wd} className="rounded-lg bg-brand-50 px-1 py-2 text-center text-[0.6875rem] font-semibold text-ink-700">
            <span className="hidden sm:inline">{thaiWeekday(wd)}</span>
            <span className="sm:hidden">{thaiWeekday(wd, true)}</span>
          </div>
        ))}
      </div>

      <div className="calendar-scroll grid flex-1 auto-rows-fr grid-cols-7 gap-1.5 overflow-y-auto p-2 sm:p-3">
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
                // การ์ดวันแบบแยกช่องมีมุมโค้ง (แบบจาก Stitch)
                'flex min-h-24 flex-col items-start gap-1 rounded-xl border border-ink-200/80 bg-white p-1.5 text-start shadow-[0_2px_6px_-1px_rgb(31_26_23/0.04)] transition-colors sm:p-2',
                'hover:border-brand-300 hover:bg-brand-50/50 focus-visible:bg-brand-50',
                outside && 'border-transparent bg-ink-100/60 text-ink-500 shadow-none',
                isToday && 'border-2 border-brand-500',
              )}
            >
              <span className="flex w-full items-center justify-between">
                <span
                  className={cx(
                    'text-sm font-semibold tabular-nums',
                    isToday && 'flex size-7 items-center justify-center rounded-full bg-brand-500 text-white',
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

              {/*
                ช่วงเวลาที่ถูกจอง + ชื่อผู้จอง — บรรทัดเดียวต่อรายการ ห้ามปัดลง
                ชื่อยาวเกินให้ตัดท้ายเป็น … (truncate = nowrap + ซ่อนส่วนเกิน + …)
                สูงสุด 3 รายการ ที่เหลือบอกเป็น +N
              */}
              {ranges.length > 0 && (
                <span className="flex w-full min-w-0 flex-col gap-0.5">
                  {ranges.slice(0, MAX_RANGES).map((r, i) => (
                    <span
                      key={i}
                      className={cx(
                        'block w-full min-w-0 truncate rounded-md px-1 py-0.5 text-[0.625rem] tabular-nums',
                        busyDay ? 'bg-red-50 text-red-800' : 'bg-brand-50 text-brand-900',
                      )}
                      title={r.who ? `${r.label} ${r.who}` : r.label}
                    >
                      <span className="font-bold">{r.label}</span>
                      {r.who && <span className="text-ink-700"> {r.who}</span>}
                    </span>
                  ))}
                  {ranges.length > MAX_RANGES && (
                    <span className="text-[0.625rem] font-bold text-brand-800">+{ranges.length - MAX_RANGES} รายการ</span>
                  )}
                </span>
              )}

              {/* สถานะวันอยู่ท้ายช่อง (ผู้ใช้ขอ): เต็ม = ป้ายแดง "ไม่ว่าง" (พื้นแดงเข้ม+ตัวขาว ผ่าน WCAG AA มีสัญลักษณ์กำกับ) */}
              {busyDay ? (
                <span className="mt-auto inline-flex items-center gap-1 rounded-full bg-red-600 px-1.5 py-0.5 text-[0.625rem] font-semibold text-white">
                  <span aria-hidden="true">●</span>
                  {t('calendar.busyDay')}
                </span>
              ) : (
                <span className="mt-auto flex items-center gap-1 text-[0.625rem] font-medium">
                  <span aria-hidden="true" style={{ color: meta.color }}>
                    {meta.symbol}
                  </span>
                  <span className={outside ? 'text-ink-500' : 'text-ink-700'}>{t(meta.labelKey)}</span>
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* คำอธิบายจุดสี */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-1 border-t border-ink-200/70 px-4 py-2.5 text-xs text-ink-700 sm:px-6">
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

/** ชื่อต้นจาก "ชื่อ นามสกุล" — ถ้าไม่มีช่องว่างคืนทั้งชื่อ */
function firstName(fullName: string | null): string | null {
  if (!fullName) return null;
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}
