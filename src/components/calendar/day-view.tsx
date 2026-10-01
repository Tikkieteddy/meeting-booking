'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { CalendarBooking, CalendarClosure } from '@/lib/domain/calendar-shared';
import { layoutOverlaps } from '@/lib/domain/calendar-shared';
import type { Room } from '@/lib/domain/rooms';
import { cx } from '@/components/ui/primitives';
import { t } from '@/lib/i18n';
import { minutesToHhmm, partsInZone, toDateISO } from '@/lib/util/time';
import { BookingCard } from './booking-card';
import { HOUR_PX, OCCUPANCY_DOT, TZ, cardGeometry, hourLabels, minutesOfDay, occupancyOf, timeWindow } from './shared';
import { OccupancyLegend } from './legend';

/**
 * มุมมองรายวัน (บรีฟข้อ 3.1)
 *  - Timeline ตามเวลาทำการของห้อง
 *  - เส้นเวลาปัจจุบันสีแดงพร้อมป้ายบอกเวลา และเลื่อนไปใกล้เวลาปัจจุบันเมื่อเปิดหน้า
 *  - คลิกช่วงว่างเพื่อเปิดฟอร์มจองโดยใส่ห้อง วันที่ และเวลาให้ล่วงหน้า
 *  - เลือก "ทุกห้อง" จะแสดงคอลัมน์แยกรายห้อง
 */
export function DayView({
  dateISO,
  rooms,
  selectedRoomId,
  bookings,
  closures,
  onOpenBooking,
  onPickSlot,
  conflictSlotKey,
}: {
  dateISO: string;
  rooms: Room[];
  selectedRoomId: string | null;
  bookings: CalendarBooking[];
  closures: CalendarClosure[];
  onOpenBooking: (booking: CalendarBooking) => void;
  onPickSlot: (roomId: string, startTime: string) => void;
  conflictSlotKey: string | null;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  /*
   * มือถือ + "ทุกห้อง": แสดงทีละห้องพร้อมปุ่มเลื่อนห้อง (แบบจาก Stitch)
   * เดิมบีบทุกห้องลงจอ 390px จนชื่อและการ์ดอ่านไม่ออก
   */
  const isNarrow = useIsNarrow();
  const [mobileIndex, setMobileIndex] = useState(0);
  const oneAtATime = isNarrow && !selectedRoomId && rooms.length > 1;
  const safeIndex = Math.min(mobileIndex, Math.max(0, rooms.length - 1));
  const columns = selectedRoomId
    ? rooms.filter((r) => r.id === selectedRoomId)
    : oneAtATime
      ? rooms.slice(safeIndex, safeIndex + 1)
      : rooms;

  const window = useMemo(() => {
    const open = columns.reduce((min, r) => (r.policy.openTime < min ? r.policy.openTime : min), '23:59');
    const close = columns.reduce((max, r) => (r.policy.closeTime > max ? r.policy.closeTime : max), '00:00');
    return timeWindow(columns.length ? open : '08:00', columns.length ? close : '20:00');
  }, [columns]);

  const todayISO = toDateISO(new Date(), TZ);
  const isToday = dateISO === todayISO;
  const nowMinutes = isToday ? (() => {
    const p = partsInZone(new Date(), TZ);
    return p.hour * 60 + p.minute;
  })() : null;

  // เลื่อนไปใกล้เวลาปัจจุบันเมื่อเปิดหน้า
  useEffect(() => {
    if (!scrollRef.current) return;
    const target = nowMinutes ?? window.openMinutes + 60;
    const offset = ((target - window.openMinutes) / 60) * HOUR_PX - 80;
    scrollRef.current.scrollTop = Math.max(0, offset);
  }, [dateISO, nowMinutes, window.openMinutes]);

  const hours = hourLabels(window);
  const gridHeight = (window.totalMinutes / 60) * HOUR_PX;

  if (columns.length === 0) {
    return <p className="p-6 text-sm text-ink-500">ยังไม่มีห้องประชุมในระบบ</p>;
  }

  const current = rooms[safeIndex];
  const nextRoom = rooms[safeIndex + 1];

  return (
    <div className="flex h-full flex-col">
      {oneAtATime && current && (
        <div className="shrink-0 border-b border-ink-200 bg-white px-3 py-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMobileIndex((i) => Math.max(0, i - 1))}
              disabled={safeIndex === 0}
              aria-label={t('calendar.prevRoom')}
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-ink-100 text-ink-800 disabled:opacity-40"
            >
              <span aria-hidden="true">‹</span>
            </button>
            <div className="min-w-0 flex-1 text-center" aria-live="polite">
              <p className="truncate text-sm font-bold text-ink-900">{current.name}</p>
              <p className="truncate text-xs text-ink-600">
                {t('booking.capacity')} {current.capacity} {t('common.people')}
                {current.floor ? ` · ชั้น ${current.floor}` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setMobileIndex((i) => Math.min(rooms.length - 1, i + 1))}
              disabled={!nextRoom}
              aria-label={t('calendar.nextRoom')}
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-ink-100 text-ink-800 disabled:opacity-40"
            >
              <span aria-hidden="true">›</span>
            </button>
          </div>
          <p className="mt-1 truncate text-center text-[0.6875rem] text-ink-600">
            {t('calendar.roomOf', { n: safeIndex + 1, total: rooms.length })}
            {nextRoom ? ` · ${t('calendar.nextRoomHint', { name: nextRoom.name })}` : ''}
          </p>
        </div>
      )}

      {/* หัวคอลัมน์ห้อง (คงที่เมื่อเลื่อน) */}
      {columns.length > 1 && (
        <div className="flex shrink-0 border-b border-ink-200 bg-white/60">
          <div className="w-14 shrink-0 sm:w-16" />
          {columns.map((room) => {
            const level = occupancyOf(
              bookings.filter((b) => b.roomId === room.id),
              window,
            );
            return (
              <div key={room.id} className="min-w-32 flex-1 border-s border-ink-200/70 px-3 py-2.5">
                <p className="flex items-center gap-2 text-xs font-bold text-ink-900">
                  <span className="truncate">{room.name}</span>
                  <span aria-hidden="true" className={cx('ms-auto size-2.5 shrink-0 rounded-full', OCCUPANCY_DOT[level])} />
                  <span className="sr-only">{t(`occupancy.${level}` as 'occupancy.free')}</span>
                </p>
                <p className="truncate text-[0.6875rem] text-ink-600">
                  {t('booking.capacity')} {room.capacity} {t('common.people')}
                  {room.floor ? ` · ชั้น ${room.floor}` : ''}
                </p>
              </div>
            );
          })}
        </div>
      )}

      <div ref={scrollRef} className="calendar-scroll flex-1 overflow-y-auto">
        <div className="relative flex" style={{ height: gridHeight }}>
          {/* แกนเวลา */}
          <div className="sticky start-0 z-20 w-14 shrink-0 bg-white/70 backdrop-blur-sm sm:w-16">
            {hours.map((hour, index) => (
              <div
                key={hour.minutes}
                // ป้ายแรกชิดขอบบนพอดี ถ้าเลื่อนขึ้นครึ่งหนึ่งจะโดนหัวตารางบังจนอ่านไม่ออก
                className={cx(
                  'absolute pe-2 text-end text-[0.6875rem] font-semibold tabular-nums text-ink-600',
                  index === 0 ? 'translate-y-0.5' : '-translate-y-1/2',
                )}
                style={{ top: ((hour.minutes - window.openMinutes) / 60) * HOUR_PX, width: '100%' }}
              >
                {hour.label}
              </div>
            ))}
          </div>

          {/* คอลัมน์ห้อง */}
          {columns.map((room) => {
            const roomBookings = bookings.filter((b) => b.roomId === room.id);
            const laid = layoutOverlaps(roomBookings);
            const roomClosures = closures.filter((c) => c.roomId === room.id);
            const stepMinutes = room.policy.slotStepMinutes;
            const slots: number[] = [];
            for (let m = window.openMinutes; m < window.closeMinutes; m += stepMinutes) slots.push(m);

            return (
              <div key={room.id} className="relative min-w-32 flex-1 border-s border-ink-100">
                {/* เส้นชั่วโมง */}
                {hours.map((hour) => (
                  <div
                    key={hour.minutes}
                    className="absolute inset-x-0 border-t border-ink-100"
                    style={{ top: ((hour.minutes - window.openMinutes) / 60) * HOUR_PX }}
                    aria-hidden="true"
                  />
                ))}

                {/* ช่วงว่างที่กดจองได้ */}
                {slots.map((minutes) => {
                  const timeLabel = minutesToHhmm(minutes);
                  const slotKey = `${room.id}|${timeLabel}`;
                  const busy = roomBookings.some((b) => {
                    const start = minutesOfDay(b.startsAt);
                    const end = minutesOfDay(b.endsAt);
                    return minutes >= start && minutes < end;
                  });
                  const closed = roomClosures.some((c) => {
                    const start = minutesOfDay(c.startsAt);
                    const end = minutesOfDay(c.endsAt);
                    return minutes >= start && minutes < end;
                  });
                  return (
                    <button
                      key={slotKey}
                      type="button"
                      disabled={busy || closed}
                      onClick={() => onPickSlot(room.id, timeLabel)}
                      aria-label={
                        busy || closed
                          ? `${timeLabel} ${closed ? t('calendar.closure') : t('calendar.slotBusy')}`
                          : `จอง ${room.name} เวลา ${timeLabel}`
                      }
                      className={cx(
                        'absolute inset-x-0 border-b border-dashed border-transparent',
                        busy || closed
                          ? cx('cursor-not-allowed', closed && 'bg-slate-100/70')
                          : 'hover:bg-brand-50/70 focus-visible:bg-brand-50',
                        conflictSlotKey === slotKey && 'conflict-pulse',
                      )}
                      style={{
                        top: ((minutes - window.openMinutes) / 60) * HOUR_PX,
                        height: (stepMinutes / 60) * HOUR_PX,
                      }}
                    />
                  );
                })}

                {/* ช่วงปิดปรับปรุง */}
                {roomClosures.map((closure) => {
                  const geo = cardGeometry(closure, window, dateISO);
                  return (
                    <div
                      key={`${closure.roomId}-${closure.startsAt}`}
                      className="absolute inset-x-1 z-10 rounded-lg border border-slate-300 bg-[repeating-linear-gradient(45deg,#e2e8f0,#e2e8f0_6px,#f1f5f9_6px,#f1f5f9_12px)] px-2 py-1 text-[0.6875rem] font-medium text-slate-700"
                      style={{ top: geo.top, height: geo.height }}
                      title={closure.reason}
                    >
                      🛠 {t('calendar.closure')}: {closure.reason}
                    </div>
                  );
                })}

                {/* การ์ดการจอง */}
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
                        style={{ position: 'relative', height: '100%' }}
                      />
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* เส้นเวลาปัจจุบัน */}
          {nowMinutes !== null && nowMinutes >= window.openMinutes && nowMinutes <= window.closeMinutes && (
            <>
              {/*
                เส้นอยู่ "ใต้" การ์ดการจอง (z-[5] < การ์ด z-10) จึงไม่ขีดทับตัวหนังสือในการ์ด
                ส่วนป้ายเวลาอยู่ในแกนเวลาด้านซ้ายและลอยเหนือทุกอย่างในตาราง
              */}
              <div
                className="pointer-events-none absolute inset-x-0 z-[5] flex items-center"
                style={{ top: ((nowMinutes - window.openMinutes) / 60) * HOUR_PX }}
                aria-hidden="true"
              >
                <span data-tour="nowline" className="now-line h-0.5 flex-1" />
              </div>
              <span
                aria-hidden="true"
                // red-500 กับตัวอักษรขาวได้แค่ 3.81:1 — ใช้ red-600 ที่ได้ 4.77:1 ผ่านเกณฑ์
                className="pointer-events-none absolute start-1 z-30 -translate-y-1/2 rounded-md bg-red-600 px-1.5 py-0.5 text-[0.625rem] font-bold tabular-nums text-white"
                style={{ top: ((nowMinutes - window.openMinutes) / 60) * HOUR_PX }}
              >
                {minutesToHhmm(nowMinutes)}
              </span>
            </>
          )}
        </div>
      </div>
      <OccupancyLegend />
      {nowMinutes !== null && (
        <p className="sr-only" aria-live="off">
          {t('calendar.now')} {minutesToHhmm(nowMinutes)}
        </p>
      )}
    </div>
  );
}

/** จอแคบกว่า 640px (มือถือ) — ตอน render ฝั่ง server ถือว่าไม่ใช่มือถือ แล้วค่อยปรับหลังโหลด */
function useIsNarrow(): boolean {
  return useSyncExternalStore(
    (notify) => {
      const mq = window.matchMedia('(max-width: 639px)');
      mq.addEventListener('change', notify);
      return () => mq.removeEventListener('change', notify);
    },
    () => window.matchMedia('(max-width: 639px)').matches,
    () => false,
  );
}
