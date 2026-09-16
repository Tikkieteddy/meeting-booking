import { describe, expect, it } from 'vitest';
import { MAX_OCCURRENCES, RecurrenceError, describeRecurrence, expandRecurrence } from '@/lib/domain/recurrence';

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
      'ทุก 2 วัน จนถึง 2026-10-01',
    );
  });
});
