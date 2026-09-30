import { t } from '@/lib/i18n';

/**
 * เวลาเตือนก่อนประชุม — ฟังก์ชันบริสุทธิ์ ใช้ได้ทั้งฝั่งเว็บและ server
 *
 * เก็บเป็น "จำนวนนาทีก่อนเริ่มประชุม" (0 = เตือนตอนเริ่มประชุม)
 * ขอบเขตตรงกับ CHECK ในฐานข้อมูล (migration 005 และ 010): ไม่เกิน 5 ครั้ง ไม่เกิน 1 สัปดาห์
 */
export const MAX_REMINDERS = 5;
export const MAX_REMINDER_MINUTES = 10080;
export const DEFAULT_REMINDER_LEADS = [1440, 15];

/** ตัวเลือกสำเร็จรูปแบบ Google Calendar — นอกจากนี้ผู้ใช้กำหนดเองได้ */
export const REMINDER_PRESETS = [0, 5, 10, 15, 30, 60, 120, 1440, 2880, 10080];

/** ค่าที่เพิ่มให้เมื่อกด "เพิ่มการแจ้งเตือน" — เลือกค่าสำเร็จรูปแรกที่ยังไม่ได้ใช้ เริ่มที่ 30 นาทีเหมือน Google */
export function nextReminderLead(existing: number[]): number {
  const order = [30, 10, 60, 15, 5, 0, 120, 1440, 2880, 10080];
  return order.find((m) => !existing.includes(m)) ?? 30;
}

/** ตัดค่าซ้ำ ตัดค่านอกขอบเขต เรียงจากไกลไปใกล้ และไม่เกิน MAX_REMINDERS */
export function normalizeReminderLeads(leads: readonly number[]): number[] {
  const valid = leads.filter((m) => Number.isInteger(m) && m >= 0 && m <= MAX_REMINDER_MINUTES);
  return [...new Set(valid)].sort((a, b) => b - a).slice(0, MAX_REMINDERS);
}

/** "15 นาที", "1 ชั่วโมง 30 นาที", "2 วัน", "1 สัปดาห์" (ไม่มีคำว่า "ก่อน") */
export function formatReminderDuration(minutes: number): string {
  if (minutes > 0 && minutes % 10080 === 0) return t('reminder.weeks', { n: minutes / 10080 });
  if (minutes > 0 && minutes % 1440 === 0) return t('reminder.days', { n: minutes / 1440 });
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    const h = t('reminder.hours', { n: hours });
    return rest ? `${h} ${t('reminder.minutes', { n: rest })}` : h;
  }
  return t('reminder.minutes', { n: minutes });
}

/** ป้ายของตัวเลือก: "ตอนเริ่มประชุม" หรือ "15 นาทีก่อน" */
export function formatReminderLead(minutes: number): string {
  return minutes === 0 ? t('reminder.atStart') : t('reminder.before', { duration: formatReminderDuration(minutes) });
}

/** หัวข้อข้อความเตือนที่ส่งไปทาง LINE/อีเมล */
export function reminderSubject(minutes: number, title: string): string {
  return minutes === 0
    ? t('reminder.subjectAtStart', { title })
    : t('reminder.subjectBefore', { duration: formatReminderDuration(minutes), title });
}

export type ReminderUnit = 'minute' | 'hour' | 'day' | 'week';
export const REMINDER_UNIT_MINUTES: Record<ReminderUnit, number> = { minute: 1, hour: 60, day: 1440, week: 10080 };

/** แยกนาทีเป็น "ตัวเลข + หน่วย" ที่ใหญ่ที่สุดที่หารลงตัว — ใช้ตอนเปิดโหมดกำหนดเอง */
export function splitReminderLead(minutes: number): { amount: number; unit: ReminderUnit } {
  for (const unit of ['week', 'day', 'hour'] as const) {
    const size = REMINDER_UNIT_MINUTES[unit];
    if (minutes > 0 && minutes % size === 0) return { amount: minutes / size, unit };
  }
  return { amount: minutes, unit: 'minute' };
}
