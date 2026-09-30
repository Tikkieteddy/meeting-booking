import type { CalendarBooking } from '@/lib/domain/calendar-shared';
import { hhmmToMinutes, partsInZone, toDateISO } from '@/lib/util/time';

/**
 * ความสูงของหนึ่งชั่วโมงในตารางเวลา (พิกเซล)
 * เพิ่มจาก 56 เป็น 84 ตามแบบใหม่ — ตัวอักษรทั้งเว็บขยาย 150% การ์ด 30 นาทีเดิมเตี้ยจนอ่านไม่ออก
 */
export const HOUR_PX = 84;
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

/**
 * สีของการ์ดตามสถานะ (แบบจาก Stitch: พื้นสีอ่อน + แถบสีทึบด้านซ้าย)
 * สีบอกสถานะเท่านั้น และมีข้อความ/สัญลักษณ์กำกับเสมอ — ตัวอักษรใช้โทนเข้ม (900) ผ่าน AA บนพื้นอ่อน
 */
export function bookingTone(status: string, isMine: boolean): string {
  if (status === 'pending') return 'border-amber-200 border-s-amber-500 bg-amber-50 text-amber-950';
  if (status === 'checked_in') return 'border-emerald-200 border-s-emerald-600 bg-emerald-50 text-emerald-950';
  if (status === 'maintenance' || status === 'completed') return 'border-stone-200 border-s-stone-500 bg-stone-100 text-stone-900';
  if (status === 'no_show') return 'border-red-200 border-s-red-600 bg-red-50 text-red-950';
  if (isMine) return 'border-brand-200 border-s-brand-500 bg-brand-50 text-brand-900';
  return 'border-blue-200 border-s-blue-600 bg-blue-50 text-blue-950';
}

export type Occupancy = 'free' | 'partial' | 'almost' | 'full';

/** ความหนาแน่นของห้องในวันนั้น จากนาทีที่ถูกจองเทียบกับเวลาทำการ — ใช้กับจุดสีบนหัวคอลัมน์ */
export function occupancyOf(bookings: readonly Pick<CalendarBooking, 'startsAt' | 'endsAt'>[], window: TimeWindow): Occupancy {
  const booked = bookings.reduce((sum, b) => sum + Math.max(0, minutesOfDay(b.endsAt) - minutesOfDay(b.startsAt)), 0);
  const ratio = booked / window.totalMinutes;
  if (ratio <= 0) return 'free';
  if (ratio < 0.6) return 'partial';
  if (ratio < 0.9) return 'almost';
  return 'full';
}

export const OCCUPANCY_DOT: Record<Occupancy, string> = {
  free: 'bg-green-600',
  partial: 'bg-blue-600',
  almost: 'bg-orange-500',
  full: 'bg-red-600',
};

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
