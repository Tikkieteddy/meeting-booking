/**
 * เวลาและโซนเวลา — บรีฟข้อ 1: เก็บ UTC ในฐานข้อมูล แสดงผลตาม Asia/Bangkok
 * ใช้ Intl ของ Node/Browser ล้วน ไม่พึ่งไลบรารีภายนอก
 */

export const DEFAULT_TZ = 'Asia/Bangkok';

export type ZonedParts = {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number; // 0 = อาทิตย์
};

const partsCache = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = partsCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
    });
    partsCache.set(tz, f);
  }
  return f;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** แตกวันเวลาของ Date (UTC instant) ออกเป็นส่วนประกอบตามโซนเวลาที่ระบุ */
export function partsInZone(date: Date, tz: string = DEFAULT_TZ): ZonedParts {
  const map: Record<string, string> = {};
  for (const p of formatter(tz).formatToParts(date)) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    // Intl ให้ '24' สำหรับเที่ยงคืนในบางเวอร์ชัน
    hour: Number(map.hour) % 24,
    minute: Number(map.minute),
    second: Number(map.second),
    weekday: WEEKDAY_INDEX[map.weekday ?? 'Sun'] ?? 0,
  };
}

/** ระยะห่าง (มิลลิวินาที) ระหว่างโซนเวลากับ UTC ณ เวลาที่ระบุ */
export function zoneOffsetMs(date: Date, tz: string = DEFAULT_TZ): number {
  const p = partsInZone(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - date.getTime();
}

/** แปลง "วันเวลาในโซนท้องถิ่น" -> Date (UTC instant) รองรับ DST ด้วยการปรับสองรอบ */
export function zonedToUtc(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  tz: string = DEFAULT_TZ,
): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute, 0);
  let offset = zoneOffsetMs(new Date(naive), tz);
  let candidate = new Date(naive - offset);
  offset = zoneOffsetMs(candidate, tz);
  candidate = new Date(naive - offset);
  return candidate;
}

/** แปลงสตริง 'YYYY-MM-DD' + 'HH:mm' ในโซนท้องถิ่น -> Date (UTC) */
export function localDateTimeToUtc(dateISO: string, timeHHmm: string, tz: string = DEFAULT_TZ): Date {
  const [y, m, d] = dateISO.split('-').map(Number);
  const [h, mi] = timeHHmm.split(':').map(Number);
  if (!y || !m || !d) throw new Error(`รูปแบบวันที่ไม่ถูกต้อง: ${dateISO}`);
  return zonedToUtc(y, m, d, h ?? 0, mi ?? 0, tz);
}

/** 'YYYY-MM-DD' ของวันตามโซนเวลา */
export function toDateISO(date: Date, tz: string = DEFAULT_TZ): string {
  const p = partsInZone(date, tz);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** 'HH:mm' ตามโซนเวลา */
export function toTimeHHmm(date: Date, tz: string = DEFAULT_TZ): string {
  const p = partsInZone(date, tz);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

/** เวลาเริ่มต้นวัน (00:00 ในโซนท้องถิ่น) เป็น UTC */
export function startOfLocalDay(dateISO: string, tz: string = DEFAULT_TZ): Date {
  return localDateTimeToUtc(dateISO, '00:00', tz);
}

/** เวลาเริ่มต้นของวันถัดไป — ใช้เป็นขอบบนแบบ half-open [start, end) */
export function endOfLocalDay(dateISO: string, tz: string = DEFAULT_TZ): Date {
  return new Date(startOfLocalDay(dateISO, tz).getTime() + 24 * 3600_000);
}

/** บวกวันบนสตริง 'YYYY-MM-DD' (ปลอดภัยกับสิ้นเดือน/ปี) */
export function addDaysISO(dateISO: string, days: number): string {
  const [y, m, d] = dateISO.split('-').map(Number);
  const base = Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  const next = new Date(base + days * 24 * 3600_000);
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(
    next.getUTCDate(),
  ).padStart(2, '0')}`;
}

/** บวกเดือนบนสตริง 'YYYY-MM-DD' โดยหนีบวันที่ไม่ให้ล้นเดือน (31 ม.ค. + 1 เดือน = 28/29 ก.พ.) */
export function addMonthsISO(dateISO: string, months: number): string {
  const [y, m, d] = dateISO.split('-').map(Number);
  const year = y ?? 1970;
  const monthIndex = (m ?? 1) - 1 + months;
  const targetYear = year + Math.floor(monthIndex / 12);
  const targetMonth = ((monthIndex % 12) + 12) % 12;
  const daysInTarget = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const day = Math.min(d ?? 1, daysInTarget);
  return `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** วันในสัปดาห์ของสตริงวันที่ (0 = อาทิตย์) */
export function weekdayOfISO(dateISO: string): number {
  const [y, m, d] = dateISO.split('-').map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)).getUTCDay();
}

/** วันจันทร์ต้นสัปดาห์ของวันที่ระบุ */
export function startOfWeekISO(dateISO: string, weekStartsOn = 1): string {
  const wd = weekdayOfISO(dateISO);
  const diff = (wd - weekStartsOn + 7) % 7;
  return addDaysISO(dateISO, -diff);
}

/** ช่วงวันที่ของตารางเดือน (รวมวันคาบเกี่ยวต้น/ท้ายเดือนให้ครบสัปดาห์) */
export function monthGridRange(dateISO: string, weekStartsOn = 1): { start: string; end: string } {
  const [y, m] = dateISO.split('-').map(Number);
  const first = `${y}-${String(m).padStart(2, '0')}-01`;
  const daysInMonth = new Date(Date.UTC(y ?? 1970, m ?? 1, 0)).getUTCDate();
  const last = `${y}-${String(m).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
  const start = startOfWeekISO(first, weekStartsOn);
  const endWeekStart = startOfWeekISO(last, weekStartsOn);
  return { start, end: addDaysISO(endWeekStart, 6) };
}

/** 'HH:mm' -> จำนวนนาทีจากเที่ยงคืน */
export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** จำนวนนาทีจากเที่ยงคืน -> 'HH:mm' */
export function minutesToHhmm(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** ปัดนาทีลงให้ตรง step (เช่น step 30 นาที) */
export function floorToStep(minutes: number, step: number): number {
  return Math.floor(minutes / step) * step;
}

const TH_MONTHS = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
];
const TH_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const TH_WEEKDAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
const TH_WEEKDAYS_SHORT = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];

export type DateFormatStyle = 'th-buddhist' | 'iso';

/** วันที่แบบไทย เช่น "15 กันยายน 2569" (พ.ศ.) */
export function formatThaiDate(dateISO: string, style: DateFormatStyle = 'th-buddhist'): string {
  const [y, m, d] = dateISO.split('-').map(Number);
  if (style === 'iso') return dateISO;
  return `${d} ${TH_MONTHS[(m ?? 1) - 1]} ${(y ?? 0) + 543}`;
}

/** วันที่แบบสั้น เช่น "15 ก.ย. 69" */
export function formatThaiDateShort(dateISO: string): string {
  const [y, m, d] = dateISO.split('-').map(Number);
  return `${d} ${TH_MONTHS_SHORT[(m ?? 1) - 1]} ${String(((y ?? 0) + 543) % 100).padStart(2, '0')}`;
}

/** เดือนและปี เช่น "กันยายน 2569" */
export function formatThaiMonth(dateISO: string): string {
  const [y, m] = dateISO.split('-').map(Number);
  return `${TH_MONTHS[(m ?? 1) - 1]} ${(y ?? 0) + 543}`;
}

export function thaiWeekday(index: number, short = false): string {
  return (short ? TH_WEEKDAYS_SHORT : TH_WEEKDAYS)[((index % 7) + 7) % 7] ?? '';
}

/** ช่วงเวลาอ่านง่าย เช่น "13:00 – 15:00 น." */
export function formatTimeRange(startsAt: Date, endsAt: Date, tz: string = DEFAULT_TZ): string {
  return `${toTimeHHmm(startsAt, tz)} – ${toTimeHHmm(endsAt, tz)} น.`;
}

/** ระยะเวลาอ่านง่าย เช่น "1 ชม. 30 นาที" */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} นาที`;
  if (m === 0) return `${h} ชม.`;
  return `${h} ชม. ${m} นาที`;
}
