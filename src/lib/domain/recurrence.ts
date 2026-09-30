import { addDaysISO, addMonthsISO, formatThaiDate, startOfWeekISO, thaiWeekday, weekdayOfISO } from '@/lib/util/time';

/**
 * การจองซ้ำ (บรีฟข้อ 5.1)
 * รองรับรายวัน รายสัปดาห์ (เลือกวันในสัปดาห์ได้) รายเดือน (วันที่เดิม หรือ "วันพุธที่ 2 / วันพุธสุดท้าย")
 * และรายปี — ตัวเลือกแบบ Google Calendar (migration 011)
 * ต้องมีจุดสิ้นสุดเสมอ: ระบุวันสิ้นสุด หรือจำนวนครั้ง
 */
export const MAX_OCCURRENCES = 104; // ประมาณ 2 ปีของการประชุมรายสัปดาห์

/** สัปดาห์เริ่มวันจันทร์ ให้ตรงกับ Week View ของปฏิทิน */
const WEEK_STARTS_ON = 1;

export type RecurrenceRule = {
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  intervalCount: number; // ทุก ๆ N วัน/สัปดาห์/เดือน/ปี
  byWeekdays?: number[] | null; // ใช้กับ weekly (0 = อาทิตย์)
  /** ใช้กับ monthly: สัปดาห์ที่ 1–5 ของเดือน หรือ -1 = สุดท้าย (วันในสัปดาห์เดียวกับวันเริ่ม) — ว่าง = วันที่เดิม */
  monthWeek?: number | null;
  untilDate?: string | null; // 'YYYY-MM-DD'
  occurrenceCount?: number | null;
};

export class RecurrenceError extends Error {}

/** แตกกฎการจองซ้ำออกเป็นรายการวันที่ (รวมวันแรกเสมอ) */
export function expandRecurrence(startDateISO: string, rule: RecurrenceRule): string[] {
  const interval = Math.max(1, Math.trunc(rule.intervalCount || 1));
  const limit = rule.occurrenceCount ?? MAX_OCCURRENCES;
  if (!rule.untilDate && !rule.occurrenceCount) {
    throw new RecurrenceError('การจองซ้ำต้องระบุวันสิ้นสุดหรือจำนวนครั้ง');
  }
  if (rule.occurrenceCount != null && (rule.occurrenceCount < 1 || rule.occurrenceCount > MAX_OCCURRENCES)) {
    throw new RecurrenceError(`จำนวนครั้งต้องอยู่ระหว่าง 1 ถึง ${MAX_OCCURRENCES}`);
  }
  if (rule.untilDate && rule.untilDate < startDateISO) {
    throw new RecurrenceError('วันสิ้นสุดต้องไม่อยู่ก่อนวันเริ่ม');
  }

  const dates: string[] = [];
  const pushIfAllowed = (d: string) => {
    if (rule.untilDate && d > rule.untilDate) return false;
    if (dates.length >= Math.min(limit, MAX_OCCURRENCES)) return false;
    dates.push(d);
    return true;
  };

  if (rule.frequency === 'daily') {
    let cursor = startDateISO;
    while (pushIfAllowed(cursor)) {
      cursor = addDaysISO(cursor, interval);
      if (dates.length >= MAX_OCCURRENCES) break;
    }
    return dates;
  }

  if (rule.frequency === 'weekly') {
    // ยึดสัปดาห์จากวันจันทร์ (WEEK_STARTS_ON) เพื่อให้วันที่ที่ได้เรียงตามลำดับจริง
    // ถ้ายึดจากวันเริ่ม วันที่อยู่ก่อนวันเริ่มในสัปดาห์เดียวกันจะเลื่อนไปสัปดาห์หน้าแล้วสลับลำดับ
    const offsetFromWeekStart = (weekday: number) => (weekday - WEEK_STARTS_ON + 7) % 7;
    const weekdays = (rule.byWeekdays?.length ? [...new Set(rule.byWeekdays)] : [weekdayOfISO(startDateISO)]).sort(
      (a, b) => offsetFromWeekStart(a) - offsetFromWeekStart(b),
    );

    let weekStart = startOfWeekISO(startDateISO, WEEK_STARTS_ON);
    let guard = 0;
    while (guard++ < MAX_OCCURRENCES * 2) {
      for (const wd of weekdays) {
        const candidate = addDaysISO(weekStart, offsetFromWeekStart(wd));
        if (candidate < startDateISO) continue;
        if (!pushIfAllowed(candidate)) return dates;
      }
      weekStart = addDaysISO(weekStart, 7 * interval);
      if (rule.untilDate && weekStart > rule.untilDate) break;
      if (dates.length >= Math.min(limit, MAX_OCCURRENCES)) break;
    }
    return dates;
  }

  if (rule.frequency === 'monthly' && rule.monthWeek) {
    // "วันพุธที่ 2 ของเดือน" / "วันพุธสุดท้ายของเดือน" — เดือนที่ไม่มีสัปดาห์ที่ 5 ถูกข้าม (เหมือน Google)
    const weekday = weekdayOfISO(startDateISO);
    for (let step = 0; step < MAX_OCCURRENCES * 2; step++) {
      const candidate = nthWeekdayOfMonth(addMonthsISO(firstOfMonthISO(startDateISO), step * interval), weekday, rule.monthWeek);
      if (!candidate || candidate < startDateISO) continue;
      if (!pushIfAllowed(candidate)) break;
    }
    return dates;
  }

  // monthly (วันที่เดิม) และ yearly — หนีบไม่ให้ล้นเดือน (31 ม.ค. -> 28/29 ก.พ., 29 ก.พ. -> 28 ก.พ.)
  const monthsPerStep = rule.frequency === 'yearly' ? 12 * interval : interval;
  let cursor = startDateISO;
  let step = 0;
  while (step < MAX_OCCURRENCES) {
    if (!pushIfAllowed(cursor)) break;
    step += 1;
    cursor = addMonthsISO(startDateISO, step * monthsPerStep);
  }
  return dates;
}

function firstOfMonthISO(dateISO: string): string {
  return `${dateISO.slice(0, 7)}-01`;
}

function daysInMonth(dateISO: string): number {
  const [y, m] = dateISO.split('-').map(Number);
  return new Date(Date.UTC(y ?? 1970, m ?? 1, 0)).getUTCDate();
}

/** วันที่ของ "วัน{weekday}ที่ n" ในเดือนของ monthISO (n = -1 คือสุดท้าย) — null ถ้าเดือนนั้นไม่มี */
export function nthWeekdayOfMonth(monthISO: string, weekday: number, n: number): string | null {
  const first = firstOfMonthISO(monthISO);
  const total = daysInMonth(first);
  if (n === -1) {
    const last = `${first.slice(0, 8)}${String(total).padStart(2, '0')}`;
    return addDaysISO(last, -((weekdayOfISO(last) - weekday + 7) % 7));
  }
  const firstMatch = 1 + ((weekday - weekdayOfISO(first) + 7) % 7);
  const day = firstMatch + (n - 1) * 7;
  return day > total ? null : `${first.slice(0, 8)}${String(day).padStart(2, '0')}`;
}

/** วันนี้เป็น "วัน X ที่เท่าไรของเดือน" และเป็นครั้งสุดท้ายของเดือนหรือไม่ — ใช้สร้างตัวเลือก */
export function weekOfMonth(dateISO: string): { n: number; isLast: boolean } {
  const day = Number(dateISO.slice(8, 10));
  return { n: Math.ceil(day / 7), isLast: day + 7 > daysInMonth(dateISO) };
}

/** "วันพุธที่ 2" หรือ "วันพุธสุดท้าย" */
export function describeMonthWeek(weekday: number, monthWeek: number): string {
  return monthWeek === -1 ? `วัน${thaiWeekday(weekday)}สุดท้าย` : `วัน${thaiWeekday(weekday)}ที่ ${monthWeek}`;
}

export const WEEKDAYS_MON_TO_FRI = [1, 2, 3, 4, 5];

/** ข้อความอธิบายกฎการจองซ้ำเป็นภาษาไทย ใช้แสดงในฟอร์มและอีเมล (ส่งวันเริ่มมาเพื่อบอกวัน/วันที่ให้ชัด) */
export function describeRecurrence(rule: RecurrenceRule, startDateISO?: string): string {
  const every = rule.intervalCount > 1 ? `ทุก ${rule.intervalCount} ` : 'ทุก';
  let base: string;
  if (rule.frequency === 'daily') base = `${every}วัน`;
  else if (rule.frequency === 'weekly') {
    const wds = rule.byWeekdays ?? [];
    const isWeekdays = rule.intervalCount === 1 && wds.length === 5 && WEEKDAYS_MON_TO_FRI.every((d) => wds.includes(d));
    if (isWeekdays) base = 'ทุกวันธรรมดา (จันทร์–ศุกร์)';
    else {
      const days = wds.length ? ` (วัน${[...wds].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => thaiWeekday(d)).join(', ')})` : '';
      base = `${every}สัปดาห์${days}`;
    }
  } else if (rule.frequency === 'monthly') {
    if (rule.monthWeek && startDateISO) base = `${every}เดือน ใน${describeMonthWeek(weekdayOfISO(startDateISO), rule.monthWeek)}`;
    else if (startDateISO) base = `${every}เดือน ในวันที่ ${Number(startDateISO.slice(8, 10))}`;
    else base = `${every}เดือน`;
  } else {
    base = startDateISO ? `${every}ปี ในวันที่ ${formatThaiDate(startDateISO).replace(/ \d+$/, '')}` : `${every}ปี`;
  }

  if (rule.untilDate) return `${base} จนถึง ${formatThaiDate(rule.untilDate)}`;
  if (rule.occurrenceCount) return `${base} รวม ${rule.occurrenceCount} ครั้ง`;
  return base;
}
