/**
 * ชนิดข้อมูลและฟังก์ชันบริสุทธิ์ของปฏิทิน
 * แยกออกจาก calendar.ts (ซึ่งเป็น server-only) เพื่อให้ component ฝั่ง client เรียกใช้ได้
 */
import { addDaysISO, monthGridRange, startOfWeekISO, toDateISO, hhmmToMinutes } from '@/lib/util/time';
import { occupancyLevel, type OccupancyLevel } from './booking-rules';

const TZ = 'Asia/Bangkok';
function tz(): string {
  return process.env.APP_TIMEZONE || TZ;
}

export type CalendarView = 'day' | 'week' | 'month';

export type CalendarBooking = {
  id: string;
  roomId: string;
  title: string;
  startsAt: string; // ISO string — ส่งข้าม server/client ได้ปลอดภัย
  endsAt: string;
  status: string;
  privacy: string;
  bookerName: string | null;
  bookerDepartment: string | null;
  attendeeCount: number;
  canSeeDetails: boolean;
  isMine: boolean;
  checkedIn: boolean;
};

export type CalendarClosure = { roomId: string; startsAt: string; endsAt: string; reason: string };
export type CalendarHoliday = { dateISO: string; name: string };

export type MonthDaySummary = {
  dateISO: string;
  bookingCount: number;
  bookedMinutes: number;
  availableMinutes: number;
  occupancy: OccupancyLevel;
  holidayName: string | null;
};

export type CalendarData = {
  view: CalendarView;
  dateISO: string;
  rangeStartISO: string;
  rangeEndISO: string;
  bookings: CalendarBooking[];
  closures: CalendarClosure[];
  holidays: CalendarHoliday[];
  monthDays: MonthDaySummary[];
};


export function rangeForView(view: CalendarView, dateISO: string, weekStartsOn = 1): { start: string; end: string } {
  if (view === 'day') return { start: dateISO, end: dateISO };
  if (view === 'week') {
    const start = startOfWeekISO(dateISO, weekStartsOn);
    return { start, end: addDaysISO(start, 6) };
  }
  return monthGridRange(dateISO, weekStartsOn);
}

/** สรุปการจองรายวันสำหรับ Month View */
export function summarizeMonth(
  bookings: readonly CalendarBooking[],
  startISO: string,
  endISO: string,
  holidays: readonly CalendarHoliday[],
  openMinutesPerDay: number,
): MonthDaySummary[] {
  const byDate = new Map<string, { count: number; minutes: number }>();
  for (const b of bookings) {
    if (b.status === 'cancelled' || b.status === 'rejected' || b.status === 'no_show') continue;
    const start = new Date(b.startsAt);
    const end = new Date(b.endsAt);
    const dateISO = toDateISO(start, tz());
    const minutes = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
    const entry = byDate.get(dateISO) ?? { count: 0, minutes: 0 };
    entry.count += 1;
    entry.minutes += minutes;
    byDate.set(dateISO, entry);
  }

  const holidayMap = new Map(holidays.map((h) => [h.dateISO, h.name]));
  const out: MonthDaySummary[] = [];
  let cursor = startISO;
  let guard = 0;
  while (cursor <= endISO && guard++ < 50) {
    const entry = byDate.get(cursor) ?? { count: 0, minutes: 0 };
    out.push({
      dateISO: cursor,
      bookingCount: entry.count,
      bookedMinutes: entry.minutes,
      availableMinutes: openMinutesPerDay,
      occupancy: occupancyLevel(entry.minutes, openMinutesPerDay),
      holidayName: holidayMap.get(cursor) ?? null,
    });
    cursor = addDaysISO(cursor, 1);
  }
  return out;
}

/** นาทีเปิดทำการต่อวันจากนโยบายห้อง (ใช้เมื่อเลือกห้องเดียว) */
export function openMinutesOf(openTime: string, closeTime: string): number {
  return Math.max(0, hhmmToMinutes(closeTime) - hhmmToMinutes(openTime));
}

/**
 * จัดวางการจองที่เวลาทับกันให้แบ่งเป็นคอลัมน์ ไม่ซ่อนข้อมูล (บรีฟข้อ 3.2)
 * คืนค่า column index และจำนวนคอลัมน์รวมของกลุ่มที่ทับกัน
 */
export function layoutOverlaps<T extends { startsAt: string; endsAt: string }>(
  items: readonly T[],
): (T & { column: number; columns: number })[] {
  const sorted = [...items].sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime() || new Date(a.endsAt).getTime() - new Date(b.endsAt).getTime(),
  );
  const result: (T & { column: number; columns: number })[] = [];
  let cluster: (T & { column: number; columns: number })[] = [];
  let clusterEnd = 0;

  const flush = () => {
    const columns = cluster.reduce((max, item) => Math.max(max, item.column + 1), 1);
    for (const item of cluster) result.push({ ...item, columns });
    cluster = [];
    clusterEnd = 0;
  };

  for (const item of sorted) {
    const start = new Date(item.startsAt).getTime();
    const end = new Date(item.endsAt).getTime();
    if (cluster.length > 0 && start >= clusterEnd) flush();

    const used = new Set(
      cluster.filter((c) => new Date(c.endsAt).getTime() > start).map((c) => c.column),
    );
    let column = 0;
    while (used.has(column)) column += 1;
    cluster.push({ ...item, column, columns: 1 });
    clusterEnd = Math.max(clusterEnd, end);
  }
  if (cluster.length > 0) flush();
  return result;
}
