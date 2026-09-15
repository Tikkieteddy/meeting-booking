import type { CalendarBooking } from '@/lib/domain/calendar-shared';
import { hhmmToMinutes, partsInZone, toDateISO } from '@/lib/util/time';

/** ความสูงของหนึ่งชั่วโมงในตารางเวลา (พิกเซล) — ตรงกับ --spacing-hour ใน globals.css */
export const HOUR_PX = 56;
export const TZ = 'Asia/Bangkok';

export type TimeWindow = { openMinutes: number; closeMinutes: number; totalMinutes: number };

export function timeWindow(openTime: string, closeTime: string): TimeWindow {
  const openMinutes = hhmmToMinutes(openTime);
  const closeMinutes = hhmmToMinutes(closeTime);
  return { openMinutes, closeMinutes, totalMinutes: Math.max(60, closeMinutes - openMinutes) };
}

/** นาทีจากเที่ยงคืนตามโซนเวลาไทย */
export function minutesOfDay(iso: string, timezone = TZ): number {
  const parts = partsInZone(new Date(iso), timezone);
  return parts.hour * 60 + parts.minute;
}

/** ตำแหน่งและความสูงของการ์ดการจองในตารางเวลา (หน่วยพิกเซล) */
export function cardGeometry(
  booking: Pick<CalendarBooking, 'startsAt' | 'endsAt'>,
  window: TimeWindow,
  dateISO: string,
  timezone = TZ,
): { top: number; height: number } {
  const startsAt = new Date(booking.startsAt);
  const endsAt = new Date(booking.endsAt);
  // การจองที่คาบเกี่ยวข้ามวันจะถูกหนีบให้อยู่ในกรอบของวันที่กำลังแสดง
  const startSameDay = toDateISO(startsAt, timezone) === dateISO;
  const endSameDay = toDateISO(endsAt, timezone) === dateISO;
  const startMinutes = startSameDay ? minutesOfDay(booking.startsAt, timezone) : 0;
  const endMinutes = endSameDay ? minutesOfDay(booking.endsAt, timezone) : 24 * 60;

  const clampedStart = Math.max(window.openMinutes, Math.min(startMinutes, window.closeMinutes));
  const clampedEnd = Math.max(clampedStart + 15, Math.min(endMinutes, window.closeMinutes));
  return {
    top: ((clampedStart - window.openMinutes) / 60) * HOUR_PX,
    height: ((clampedEnd - clampedStart) / 60) * HOUR_PX,
  };
}

export function hourLabels(window: TimeWindow): { minutes: number; label: string }[] {
  const out: { minutes: number; label: string }[] = [];
  const firstHour = Math.floor(window.openMinutes / 60);
  const lastHour = Math.ceil(window.closeMinutes / 60);
  for (let h = firstHour; h <= lastHour; h += 1) {
    out.push({ minutes: h * 60, label: `${String(h % 24).padStart(2, '0')}:00` });
  }
  return out;
}

/** สีของการ์ดตามสถานะ — ใช้ร่วมกับข้อความและสัญลักษณ์เสมอ */
export function bookingTone(status: string, isMine: boolean): string {
  if (status === 'pending') return 'border-purple-300 bg-purple-50 text-purple-900';
  if (status === 'checked_in') return 'border-sky-300 bg-sky-50 text-sky-900';
  if (status === 'maintenance') return 'border-slate-300 bg-slate-100 text-slate-800';
  if (status === 'no_show') return 'border-amber-300 bg-amber-50 text-amber-900';
  if (isMine) return 'border-brand-300 bg-brand-50 text-brand-900';
  return 'border-emerald-300 bg-emerald-50 text-emerald-900';
}

/** จัดกลุ่มการจองตามวัน (ใช้ใน Week View) */
export function groupByDate(bookings: readonly CalendarBooking[], timezone = TZ): Map<string, CalendarBooking[]> {
  const map = new Map<string, CalendarBooking[]>();
  for (const booking of bookings) {
    const key = toDateISO(new Date(booking.startsAt), timezone);
    const list = map.get(key) ?? [];
    list.push(booking);
    map.set(key, list);
  }
  return map;
}
