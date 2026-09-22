'use client';

import { useMemo } from 'react';
import type { CalendarBooking, CalendarClosure, CalendarHoliday } from '@/lib/domain/calendar-shared';
import { layoutOverlaps } from '@/lib/domain/calendar-shared';
import type { Room } from '@/lib/domain/rooms';
import { cx } from '@/components/ui/primitives';
import { t } from '@/lib/i18n';
import { addDaysISO, formatThaiDateShort, minutesToHhmm, partsInZone, thaiWeekday, toDateISO, weekdayOfISO } from '@/lib/util/time';
import { BookingCard } from './booking-card';
import { HOUR_PX, TZ, cardGeometry, hourLabels, minutesOfDay, timeWindow } from './shared';

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
          <div className="sticky top-0 z-30 flex border-b border-ink-200 bg-white">
            <div className="w-14 shrink-0 sm:w-16" />
            {days.map((dateISO) => {
              const isToday = dateISO === todayISO;
              const holiday = holidayMap.get(dateISO);
              return (
                <div
                  key={dateISO}
                  className={cx(
                    'min-w-24 flex-1 border-s border-ink-100 px-1 py-2 text-center',
                    isToday && 'bg-brand-50',
                  )}
                >
                  <p className={cx('text-[11px] font-medium', isToday ? 'text-brand-700' : 'text-ink-500')}>
                    {thaiWeekday(weekdayOfISO(dateISO), true)}
                  </p>
                  <p className={cx('text-sm font-semibold tabular-nums', isToday ? 'text-brand-700' : 'text-ink-800')}>
                    {formatThaiDateShort(dateISO)}
                  </p>
                  {holiday && (
                    <p className="truncate text-[10px] text-red-600" title={holiday}>
                      🎌 {t('calendar.holiday')}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          <div className="relative flex" style={{ height: gridHeight }}>
            <div className="sticky start-0 z-20 w-14 shrink-0 bg-ink-50 sm:w-16">
              {hours.map((hour) => (
                <div
                  key={hour.minutes}
                  className="absolute -translate-y-1/2 pe-2 text-end text-[11px] tabular-nums text-ink-500"
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
                        className="absolute inset-x-0.5 z-10 rounded border border-slate-300 bg-slate-100 px-1 text-[10px] text-slate-700"
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
                          compact
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
                      className="now-line pointer-events-none absolute inset-x-0 z-20 h-0.5"
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
    </div>
  );
}
