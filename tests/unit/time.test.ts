import { describe, expect, it } from 'vitest';
import {
  addDaysISO,
  addMonthsISO,
  formatDuration,
  formatThaiDate,
  formatThaiMonth,
  hhmmToMinutes,
  localDateTimeToUtc,
  minutesToHhmm,
  monthGridRange,
  partsInZone,
  startOfLocalDay,
  startOfWeekISO,
  toDateISO,
  toTimeHHmm,
  weekdayOfISO,
  zoneOffsetMs,
} from '@/lib/util/time';

describe('เวลาและโซนเวลา (Asia/Bangkok = UTC+7 ไม่มี DST)', () => {
  it('แปลงเวลาไทยเป็น UTC ได้ถูกต้อง', () => {
    // 13:00 ที่ไทย = 06:00 UTC
    const utc = localDateTimeToUtc('2026-09-15', '13:00');
    expect(utc.toISOString()).toBe('2026-09-15T06:00:00.000Z');
  });

  it('แปลง UTC กลับเป็นเวลาไทยได้ถูกต้อง', () => {
    expect(toTimeHHmm(new Date('2026-09-15T06:00:00Z'))).toBe('13:00');
    expect(toDateISO(new Date('2026-09-15T06:00:00Z'))).toBe('2026-09-15');
  });

  it('จัดการวันข้ามคืนได้ถูกต้อง (17:00 UTC = 00:00 วันถัดไปที่ไทย)', () => {
    expect(toDateISO(new Date('2026-09-15T17:00:00Z'))).toBe('2026-09-16');
    expect(toTimeHHmm(new Date('2026-09-15T17:00:00Z'))).toBe('00:00');
  });

  it('offset ของ Asia/Bangkok เท่ากับ 7 ชั่วโมงเสมอ', () => {
    expect(zoneOffsetMs(new Date('2026-01-15T00:00:00Z'))).toBe(7 * 3600_000);
    expect(zoneOffsetMs(new Date('2026-07-15T00:00:00Z'))).toBe(7 * 3600_000);
  });

  it('startOfLocalDay คือเที่ยงคืนตามเวลาไทย', () => {
    expect(startOfLocalDay('2026-09-15').toISOString()).toBe('2026-09-14T17:00:00.000Z');
  });

  it('partsInZone แตกส่วนประกอบและวันในสัปดาห์ได้', () => {
    const parts = partsInZone(new Date('2026-09-15T06:30:00Z'));
    expect(parts).toMatchObject({ year: 2026, month: 9, day: 15, hour: 13, minute: 30, weekday: 2 });
  });
});

describe('การบวกวันและเดือน', () => {
  it('บวกวันข้ามเดือนและข้ามปีได้', () => {
    expect(addDaysISO('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDaysISO('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysISO('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('บวกเดือนแล้วหนีบวันที่ไม่ให้ล้นเดือน', () => {
    expect(addMonthsISO('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsISO('2028-01-31', 1)).toBe('2028-02-29'); // ปีอธิกสุรทิน
    expect(addMonthsISO('2026-11-30', 2)).toBe('2027-01-30');
  });

  it('หาวันจันทร์ต้นสัปดาห์ได้', () => {
    // 2026-09-15 เป็นวันอังคาร
    expect(weekdayOfISO('2026-09-15')).toBe(2);
    expect(startOfWeekISO('2026-09-15')).toBe('2026-09-14');
    expect(startOfWeekISO('2026-09-13')).toBe('2026-09-07'); // อาทิตย์ -> จันทร์ก่อนหน้า
  });

  it('ตารางเดือนครอบคลุมสัปดาห์เต็มทั้งต้นและท้ายเดือน', () => {
    const range = monthGridRange('2026-09-15');
    expect(range.start).toBe('2026-08-31');
    expect(range.end).toBe('2026-10-04');
    expect(weekdayOfISO(range.start)).toBe(1);
    expect(weekdayOfISO(range.end)).toBe(0);
  });
});

describe('การแปลงนาทีและการแสดงผลภาษาไทย', () => {
  it('แปลง HH:mm กับจำนวนนาทีไปกลับได้', () => {
    expect(hhmmToMinutes('13:30')).toBe(810);
    expect(minutesToHhmm(810)).toBe('13:30');
    expect(minutesToHhmm(1440)).toBe('00:00');
  });

  it('แสดงวันที่เป็น พ.ศ.', () => {
    expect(formatThaiDate('2026-09-15')).toBe('15 กันยายน 2569');
    expect(formatThaiMonth('2026-09-15')).toBe('กันยายน 2569');
  });

  it('แสดงระยะเวลาอ่านง่าย', () => {
    expect(formatDuration(30)).toBe('30 นาที');
    expect(formatDuration(60)).toBe('1 ชม.');
    expect(formatDuration(90)).toBe('1 ชม. 30 นาที');
  });
});
