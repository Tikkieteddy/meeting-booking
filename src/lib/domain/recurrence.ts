import { addDaysISO, addMonthsISO, weekdayOfISO } from '@/lib/util/time';

/**
 * การจองซ้ำ (บรีฟข้อ 5.1)
 * รองรับรายวัน รายสัปดาห์ (เลือกวันในสัปดาห์ได้) และรายเดือน (วันที่เดิมของเดือน)
 * ต้องมีจุดสิ้นสุดเสมอ: ระบุวันสิ้นสุด หรือจำนวนครั้ง
 */
export const MAX_OCCURRENCES = 104; // ประมาณ 2 ปีของการประชุมรายสัปดาห์

export type RecurrenceRule = {
  frequency: 'daily' | 'weekly' | 'monthly';
  intervalCount: number; // ทุก ๆ N วัน/สัปดาห์/เดือน
  byWeekdays?: number[] | null; // ใช้กับ weekly (0 = อาทิตย์)
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
    const weekdays = (rule.byWeekdays?.length ? [...rule.byWeekdays] : [weekdayOfISO(startDateISO)]).sort(
      (a, b) => a - b,
    );
    // ไล่ทีละสัปดาห์ เริ่มจากสัปดาห์ของวันเริ่ม แล้วข้ามทีละ interval สัปดาห์
    let weekStart = startDateISO;
    let guard = 0;
    while (guard++ < MAX_OCCURRENCES * 2) {
      const baseWeekday = weekdayOfISO(weekStart);
      for (const wd of weekdays) {
        const offset = (wd - baseWeekday + 7) % 7;
        const candidate = addDaysISO(weekStart, offset);
        if (candidate < startDateISO) continue;
        if (!pushIfAllowed(candidate)) return dates;
      }
      weekStart = addDaysISO(weekStart, 7 * interval);
      if (rule.untilDate && weekStart > rule.untilDate) break;
      if (dates.length >= Math.min(limit, MAX_OCCURRENCES)) break;
    }
    return dates;
  }

  // monthly — วันที่เดิมของเดือน โดยหนีบไม่ให้ล้นเดือน (31 ม.ค. -> 28/29 ก.พ.)
  let cursor = startDateISO;
  let step = 0;
  while (step < MAX_OCCURRENCES) {
    if (!pushIfAllowed(cursor)) break;
    step += 1;
    cursor = addMonthsISO(startDateISO, step * interval);
  }
  return dates;
}

/** ข้อความอธิบายกฎการจองซ้ำเป็นภาษาไทย ใช้แสดงในฟอร์มและอีเมล */
export function describeRecurrence(rule: RecurrenceRule): string {
  const names = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
  const every = rule.intervalCount > 1 ? `ทุก ${rule.intervalCount} ` : 'ทุก';
  let base: string;
  if (rule.frequency === 'daily') base = `${every}วัน`;
  else if (rule.frequency === 'weekly') {
    const days = rule.byWeekdays?.length ? ` (วัน${rule.byWeekdays.map((d) => names[d]).join(', ')})` : '';
    base = `${every}สัปดาห์${days}`;
  } else base = `${every}เดือน`;

  if (rule.untilDate) return `${base} จนถึง ${rule.untilDate}`;
  if (rule.occurrenceCount) return `${base} รวม ${rule.occurrenceCount} ครั้ง`;
  return base;
}
