'use client';

import { useMemo } from 'react';
import type { CalendarBooking, CalendarClosure, CalendarHoliday } from '@/lib/domain/calendar-shared';
import { layoutOverlaps } from '@/lib/domain/calendar-shared';
import type { Room } from '@/lib/domain/rooms';
import { cx } from '@/components/ui/primitives';
import { t } from '@/lib/i18n';
import { addDaysISO, formatThaiDateShort, minutesToHhmm, partsInZone, thaiWeekday, toDateISO, weekdayOfISO } from '@/lib/util/time';
import { BookingCard } from './booking-card';
import { HOUR_PX, OCCUPANCY_DOT, TZ, cardGeometry, hourLabels, minutesOfDay, occupancyOf, timeWindow } from './shared';
import { OccupancyLegend } from './legend';

/**
 * มุมมองรายสัปดาห์ (บรีฟข้อ 3.2)
 *  - คอลัมน์เป็นวัน แถวเป็นเวลา หัววันคงที่เมื่อเลื่อนแนวนอน (แท็บเล็ต)
 *  - วันปัจจุบันมี highlight
 *  - รายการที่ทับกันแบ่งเป็นคอลัมน์ ไม่ซ่อนข้อมูล
 */
export function WeekView({
  startISO,
  rooms,
  selectedRoomId,
  bookings,
  closures,
  holidays,
  onOpenBooking,
  onPickSlot,
}: {
  startISO: string;
  rooms: Room[];
  selectedRoomId: string | null;
  bookings: CalendarBooking[];
  closures: CalendarClosure[];
  holidays: CalendarHoliday[];
  onOpenBooking: (booking: CalendarBooking) => void;
  onPickSlot: (roomId: string, startTime: string, dateISO: string) => void;
}) {
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDaysISO(startISO, i)), [startISO]);
  const activeRooms = selectedRoomId ? rooms.filter((r) => r.id === selectedRoomId) : rooms;
  const primaryRoom = activeRooms[0];

  const window = useMemo(() => {
    const open = activeRooms.reduce((min, r) => (r.policy.openTime < min ? r.policy.openTime : min), '23:59');
    const close = activeRooms.reduce((max, r) => (r.policy.closeTime > max ? r.policy.closeTime : max), '00:00');
    return timeWindow(activeRooms.length ? open : '08:00', activeRooms.length ? close : '20:00');
  }, [activeRooms]);

  const hours = hourLabels(window);
  const gridHeight = (window.totalMinutes / 60) * HOUR_PX;
  const todayISO = toDateISO(new Date(), TZ);
  const holidayMap = new Map(holidays.map((h) => [h.dateISO, h.name]));
  const nowMinutes = (() => {
    const p = partsInZone(new Date(), TZ);
    return p.hour * 60 + p.minute;
  })();
  const stepMinutes = primaryRoom?.policy.slotStepMinutes ?? 30;

  return (
    <div className="flex h-full flex-col">
      <div className="calendar-scroll flex-1 overflow-auto">
        <div className="min-w-[44rem]">
          {/* หัววัน — คงที่เมื่อเลื่อนขึ้นลง */}
          <div className="sticky top-0 z-30 flex border-b border-ink-200 bg-brand-50/60 backdrop-blur-sm">
            <div className="w-14 shrink-0 sm:w-16" />
            {days.map((dateISO) => {
              const isToday = dateISO === todayISO;
              const holiday = holidayMap.get(dateISO);
              const level = occupancyOf(
                bookings.filter((b) => toDateISO(new Date(b.startsAt), TZ) === dateISO),
                window,
              );
              return (
                <div
                  key={dateISO}
                  className={cx('min-w-24 flex-1 border-s border-ink-200/70 px-1 py-1.5 text-center', isToday && 'bg-brand-100/60')}
                >
                  <p className={cx('text-xs font-medium', isToday ? 'font-bold text-brand-800' : 'text-ink-700')}>
                    {thaiWeekday(weekdayOfISO(dateISO))}
                  </p>
                  {/* วันที่: วันนี้เป็นวงกลมส้มตามแบบ ตัวเลขขาวบนส้มเข้ม (ผ่าน AA) */}
                  <p className="mt-0.5 flex justify-center">
                    <span
                      className={cx(
                        'flex size-8 items-center justify-center rounded-full text-sm font-bold tabular-nums',
                        isToday ? 'bg-brand-500 text-white shadow-sm' : 'text-ink-900',
                      )}
                      title={formatThaiDateShort(dateISO)}
                    >
                      {Number(dateISO.slice(8, 10))}
                    </span>
                  </p>
                  {isToday && <span className="sr-only">{t('common.today')}</span>}
                  <span aria-hidden="true" className={cx('mx-auto mt-1 block h-1 w-6 rounded-full', OCCUPANCY_DOT[level])} />
                  <span className="sr-only">{t(`occupancy.${level}` as 'occupancy.free')}</span>
                  {holiday && (
                    <p className="truncate text-[0.625rem] text-red-600" title={holiday}>
                      🎌 {t('calendar.holiday')}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          <div className="relative flex" style={{ height: gridHeight }}>
            <div className="sticky start-0 z-20 w-14 shrink-0 bg-white/45 backdrop-blur-sm sm:w-16">
              {hours.map((hour, index) => (
                <div
                  key={hour.minutes}
                  className={cx(
                    'absolute pe-2 text-end text-[0.6875rem] font-semibold tabular-nums text-ink-800',
                    index === 0 ? 'translate-y-0.5' : '-translate-y-1/2',
                  )}
                  style={{ top: ((hour.minutes - window.openMinutes) / 60) * HOUR_PX, width: '100%' }}
                >
                  {hour.label}
                </div>
              ))}
            </div>

            {days.map((dateISO) => {
              const dayBookings = bookings.filter((b) => toDateISO(new Date(b.startsAt), TZ) === dateISO);
              const laid = layoutOverlaps(dayBookings);
              const dayClosures = closures.filter((c) => toDateISO(new Date(c.startsAt), TZ) === dateISO);
              const isToday = dateISO === todayISO;
              const slots: number[] = [];
              for (let m = window.openMinutes; m < window.closeMinutes; m += stepMinutes) slots.push(m);

              return (
                <div key={dateISO} className={cx('relative min-w-24 flex-1 border-s border-ink-100', isToday && 'bg-brand-50/30')}>
                  {hours.map((hour) => (
                    <div
                      key={hour.minutes}
                      className="absolute inset-x-0 border-t border-ink-100"
                      style={{ top: ((hour.minutes - window.openMinutes) / 60) * HOUR_PX }}
                      aria-hidden="true"
                    />
                  ))}

                  {primaryRoom &&
                    slots.map((minutes) => {
                      const timeLabel = minutesToHhmm(minutes);
                      const busy = dayBookings.some((b) => {
                        if (selectedRoomId && b.roomId !== selectedRoomId) return false;
                        const start = minutesOfDay(b.startsAt);
                        const end = minutesOfDay(b.endsAt);
                        return minutes >= start && minutes < end;
                      });
                      return (
                        <button
                          key={`${dateISO}-${timeLabel}`}
                          type="button"
                          disabled={busy}
                          onClick={() => onPickSlot(primaryRoom.id, timeLabel, dateISO)}
                          aria-label={busy ? `${timeLabel} ${t('calendar.slotBusy')}` : `จองวันที่ ${dateISO} เวลา ${timeLabel}`}
                          className={cx(
                            'absolute inset-x-0',
                            busy ? 'cursor-not-allowed' : 'hover:bg-brand-100/50 focus-visible:bg-brand-100/70',
                          )}
                          style={{
                            top: ((minutes - window.openMinutes) / 60) * HOUR_PX,
                            height: (stepMinutes / 60) * HOUR_PX,
                          }}
                        />
                      );
                    })}

                  {dayClosures.map((closure) => {
                    const geo = cardGeometry(closure, window, dateISO);
                    return (
                      <div
                        key={`${closure.roomId}-${closure.startsAt}`}
                        className="absolute inset-x-0.5 z-10 rounded border border-slate-300 bg-slate-100 px-1 text-[0.625rem] text-slate-700"
                        style={{ top: geo.top, height: geo.height }}
                        title={closure.reason}
                      >
                        🛠
                      </div>
                    );
                  })}

                  {laid.map((booking) => {
                    const geo = cardGeometry(booking, window, dateISO);
                    const widthPct = 100 / booking.columns;
                    return (
                      <div
                        key={booking.id}
                        className="absolute px-0.5"
                        style={{
                          top: geo.top,
                          height: geo.height,
                          left: `${booking.column * widthPct}%`,
                          width: `${widthPct}%`,
                        }}
                      >
                        <BookingCard
                          booking={booking}
                          onOpen={onOpenBooking}
                          compact={geo.height < 44}
                          firstNameOnly
                          showRoom={!selectedRoomId}
                          roomName={rooms.find((r) => r.id === booking.roomId)?.name}
                          style={{ position: 'relative', height: '100%' }}
                        />
                      </div>
                    );
                  })}

                  {isToday && nowMinutes >= window.openMinutes && nowMinutes <= window.closeMinutes && (
                    <div
                      data-tour="nowline"
                      // อยู่ใต้การ์ด (z-[5]) ไม่ขีดทับตัวหนังสือ
                      className="now-line pointer-events-none absolute inset-x-0 z-[5] h-0.5"
                      style={{ top: ((nowMinutes - window.openMinutes) / 60) * HOUR_PX }}
                      aria-hidden="true"
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between border-t border-ink-200/70">
        <OccupancyLegend className="border-t-0" />
        <p className="px-4 py-2.5 text-xs text-ink-700 sm:px-6">
          {t('calendar.weekStats', { count: bookings.length, hours: formatHours(totalMinutes(bookings)) })}
        </p>
      </div>
    </div>
  );
}

function totalMinutes(list: readonly CalendarBooking[]): number {
  return list.reduce((sum, b) => sum + Math.max(0, (Date.parse(b.endsAt) - Date.parse(b.startsAt)) / 60000), 0);
}

function formatHours(minutes: number): string {
  const hours = Math.round((minutes / 60) * 10) / 10;
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
}
