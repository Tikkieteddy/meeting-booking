import { describe, expect, it } from 'vitest';
import {
  MAX_OCCURRENCES,
  RecurrenceError,
  describeRecurrence,
  expandRecurrence,
  nthWeekdayOfMonth,
  weekOfMonth,
} from '@/lib/domain/recurrence';

describe('การจองซ้ำ', () => {
  it('รายวันตามจำนวนครั้งที่กำหนด', () => {
    const dates = expandRecurrence('2026-09-15', { frequency: 'daily', intervalCount: 1, occurrenceCount: 4 });
    expect(dates).toEqual(['2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18']);
  });

  it('รายวันทุก 2 วัน จนถึงวันสิ้นสุด', () => {
    const dates = expandRecurrence('2026-09-15', { frequency: 'daily', intervalCount: 2, untilDate: '2026-09-21' });
    expect(dates).toEqual(['2026-09-15', '2026-09-17', '2026-09-19', '2026-09-21']);
  });

  it('รายสัปดาห์โดยใช้วันของวันเริ่มเมื่อไม่ระบุวัน', () => {
    const dates = expandRecurrence('2026-09-15', { frequency: 'weekly', intervalCount: 1, occurrenceCount: 3 });
    expect(dates).toEqual(['2026-09-15', '2026-09-22', '2026-09-29']);
  });

  it('รายสัปดาห์เลือกหลายวันในสัปดาห์ได้', () => {
    // 2026-09-15 = อังคาร (2) เลือก จันทร์(1) พุธ(3)
    const dates = expandRecurrence('2026-09-15', {
      frequency: 'weekly',
      intervalCount: 1,
      byWeekdays: [1, 3],
      occurrenceCount: 4,
    });
    // จันทร์ของสัปดาห์แรกอยู่ก่อนวันเริ่มจึงถูกข้าม
    expect(dates).toEqual(['2026-09-16', '2026-09-21', '2026-09-23', '2026-09-28']);
  });

  it('รายเดือนหนีบวันที่ไม่ให้ล้นเดือน', () => {
    const dates = expandRecurrence('2026-01-31', { frequency: 'monthly', intervalCount: 1, occurrenceCount: 3 });
    expect(dates).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
  });

  it('ต้องระบุวันสิ้นสุดหรือจำนวนครั้ง', () => {
    expect(() => expandRecurrence('2026-09-15', { frequency: 'daily', intervalCount: 1 })).toThrow(RecurrenceError);
  });

  it('ปฏิเสธวันสิ้นสุดที่อยู่ก่อนวันเริ่ม', () => {
    expect(() =>
      expandRecurrence('2026-09-15', { frequency: 'daily', intervalCount: 1, untilDate: '2026-09-01' }),
    ).toThrow(RecurrenceError);
  });

  it('ปฏิเสธจำนวนครั้งที่เกินเพดาน', () => {
    expect(() =>
      expandRecurrence('2026-09-15', { frequency: 'daily', intervalCount: 1, occurrenceCount: MAX_OCCURRENCES + 1 }),
    ).toThrow(RecurrenceError);
  });

  it('ไม่สร้างเกินเพดานแม้ช่วงวันที่จะกว้างมาก', () => {
    const dates = expandRecurrence('2026-01-01', { frequency: 'daily', intervalCount: 1, untilDate: '2030-01-01' });
    expect(dates.length).toBeLessThanOrEqual(MAX_OCCURRENCES);
  });

  it('อธิบายกฎเป็นภาษาไทยได้', () => {
    expect(describeRecurrence({ frequency: 'weekly', intervalCount: 1, occurrenceCount: 4 })).toBe('ทุกสัปดาห์ รวม 4 ครั้ง');
    expect(describeRecurrence({ frequency: 'daily', intervalCount: 2, untilDate: '2026-10-01' })).toBe(
      'ทุก 2 วัน จนถึง 1 ตุลาคม 2569',
    );
  });
});

describe('การจองซ้ำแบบ Google Calendar (migration 011)', () => {
  it('รายเดือนแบบ "วันพุธสุดท้ายของเดือน"', () => {
    // 2026-09-30 = วันพุธสุดท้ายของ ก.ย.
    const dates = expandRecurrence('2026-09-30', { frequency: 'monthly', intervalCount: 1, monthWeek: -1, occurrenceCount: 4 });
    expect(dates).toEqual(['2026-09-30', '2026-10-28', '2026-11-25', '2026-12-30']);
  });

  it('รายเดือนแบบ "วันจันทร์ที่ 2" และข้ามเดือนที่ไม่มีสัปดาห์ที่ 5', () => {
    expect(
      expandRecurrence('2026-09-14', { frequency: 'monthly', intervalCount: 1, monthWeek: 2, occurrenceCount: 3 }),
    ).toEqual(['2026-09-14', '2026-10-12', '2026-11-09']);
    // 2026-09-29 = วันอังคารที่ 5 ของ ก.ย. — ต.ค. 2026 ไม่มีอังคารที่ 5, ธ.ค. มี (29)
    expect(
      expandRecurrence('2026-09-29', { frequency: 'monthly', intervalCount: 1, monthWeek: 5, occurrenceCount: 2 }),
    ).toEqual(['2026-09-29', '2026-12-29']);
  });

  it('รายปี และ 29 ก.พ. หนีบเป็น 28 ก.พ. ในปีที่ไม่มี', () => {
    expect(expandRecurrence('2028-02-29', { frequency: 'yearly', intervalCount: 1, occurrenceCount: 2 })).toEqual([
      '2028-02-29',
      '2029-02-28',
    ]);
  });

  it('ทุกวันธรรมดา = รายสัปดาห์ จันทร์–ศุกร์', () => {
    // 2026-10-02 = ศุกร์
    expect(
      expandRecurrence('2026-10-02', { frequency: 'weekly', intervalCount: 1, byWeekdays: [1, 2, 3, 4, 5], occurrenceCount: 3 }),
    ).toEqual(['2026-10-02', '2026-10-05', '2026-10-06']);
  });

  it('รู้ว่าวันนี้เป็นสัปดาห์ที่เท่าไรของเดือน และเป็นครั้งสุดท้ายหรือไม่', () => {
    expect(weekOfMonth('2026-09-30')).toEqual({ n: 5, isLast: true });
    expect(weekOfMonth('2026-09-14')).toEqual({ n: 2, isLast: false });
    expect(nthWeekdayOfMonth('2026-10-01', 3, -1)).toBe('2026-10-28');
  });

  it('คำอธิบายบอกวัน/วันที่ให้ชัด', () => {
    expect(describeRecurrence({ frequency: 'monthly', intervalCount: 1, monthWeek: -1, occurrenceCount: 4 }, '2026-09-30')).toBe(
      'ทุกเดือน ในวันพุธสุดท้าย รวม 4 ครั้ง',
    );
    expect(describeRecurrence({ frequency: 'monthly', intervalCount: 1, occurrenceCount: 2 }, '2026-09-30')).toBe(
      'ทุกเดือน ในวันที่ 30 รวม 2 ครั้ง',
    );
    expect(describeRecurrence({ frequency: 'yearly', intervalCount: 1, occurrenceCount: 2 }, '2026-09-30')).toBe(
      'ทุกปี ในวันที่ 30 กันยายน รวม 2 ครั้ง',
    );
    expect(
      describeRecurrence({ frequency: 'weekly', intervalCount: 1, byWeekdays: [5, 1, 2, 3, 4], occurrenceCount: 10 }),
    ).toBe('ทุกวันธรรมดา (จันทร์–ศุกร์) รวม 10 ครั้ง');
  });
});
