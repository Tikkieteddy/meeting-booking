import { describe, expect, it } from 'vitest';
import { layoutOverlaps, rangeForView, summarizeMonth, openMinutesOf } from '@/lib/domain/calendar-shared';
import type { CalendarBooking } from '@/lib/domain/calendar-shared';

function booking(id: string, start: string, end: string): CalendarBooking {
  return {
    id,
    roomId: 'room-1',
    title: id,
    startsAt: start,
    endsAt: end,
    status: 'confirmed',
    privacy: 'public',
    bookerName: 'ผู้ทดสอบ',
    bookerDepartment: null,
    attendeeCount: 2,
    canSeeDetails: true,
    isMine: false,
    checkedIn: false,
  };
}

describe('การจัดวางรายการที่เวลาทับกัน', () => {
  it('รายการที่ไม่ทับกันใช้คอลัมน์เดียว', () => {
    const laid = layoutOverlaps([
      booking('a', '2026-09-15T02:00:00Z', '2026-09-15T03:00:00Z'),
      booking('b', '2026-09-15T03:00:00Z', '2026-09-15T04:00:00Z'),
    ]);
    expect(laid.map((b) => ({ id: b.id, column: b.column, columns: b.columns }))).toEqual([
      { id: 'a', column: 0, columns: 1 },
      { id: 'b', column: 0, columns: 1 },
    ]);
  });

  it('รายการที่ทับกันแบ่งคอลัมน์ ไม่ซ่อนข้อมูล', () => {
    const laid = layoutOverlaps([
      booking('a', '2026-09-15T02:00:00Z', '2026-09-15T04:00:00Z'),
      booking('b', '2026-09-15T03:00:00Z', '2026-09-15T05:00:00Z'),
      booking('c', '2026-09-15T03:30:00Z', '2026-09-15T04:30:00Z'),
    ]);
    expect(laid).toHaveLength(3);
    expect(new Set(laid.map((b) => b.column)).size).toBe(3);
    expect(laid.every((b) => b.columns === 3)).toBe(true);
  });

  it('เริ่มกลุ่มใหม่เมื่อไม่ทับกับกลุ่มก่อนหน้า', () => {
    const laid = layoutOverlaps([
      booking('a', '2026-09-15T02:00:00Z', '2026-09-15T03:00:00Z'),
      booking('b', '2026-09-15T02:30:00Z', '2026-09-15T03:30:00Z'),
      booking('c', '2026-09-15T05:00:00Z', '2026-09-15T06:00:00Z'),
    ]);
    expect(laid.find((b) => b.id === 'c')?.columns).toBe(1);
    expect(laid.find((b) => b.id === 'a')?.columns).toBe(2);
  });
});

describe('ช่วงวันที่ของแต่ละมุมมอง', () => {
  it('รายวันคือวันเดียว', () => {
    expect(rangeForView('day', '2026-09-15')).toEqual({ start: '2026-09-15', end: '2026-09-15' });
  });

  it('รายสัปดาห์เริ่มวันจันทร์ครบ 7 วัน', () => {
    expect(rangeForView('week', '2026-09-15')).toEqual({ start: '2026-09-14', end: '2026-09-20' });
  });

  it('รายเดือนครอบคลุมสัปดาห์เต็ม', () => {
    expect(rangeForView('month', '2026-09-15')).toEqual({ start: '2026-08-31', end: '2026-10-04' });
  });
});

describe('สรุปรายเดือน', () => {
  it('นับจำนวนและคิดระดับความหนาแน่นรายวัน', () => {
    const days = summarizeMonth(
      [
        booking('a', '2026-09-15T02:00:00Z', '2026-09-15T05:00:00Z'), // 3 ชม.
        booking('b', '2026-09-15T06:00:00Z', '2026-09-15T07:00:00Z'), // 1 ชม.
      ],
      '2026-09-14',
      '2026-09-16',
      [{ dateISO: '2026-09-16', name: 'วันหยุดทดสอบ' }],
      12 * 60,
    );

    expect(days).toHaveLength(3);
    expect(days[1]).toMatchObject({ dateISO: '2026-09-15', bookingCount: 2, bookedMinutes: 240, occupancy: 'partial' });
    expect(days[0]).toMatchObject({ bookingCount: 0, occupancy: 'free' });
    expect(days[2]?.holidayName).toBe('วันหยุดทดสอบ');
  });

  it('คิดนาทีเปิดทำการต่อวันได้', () => {
    expect(openMinutesOf('08:00', '20:00')).toBe(720);
  });
});
