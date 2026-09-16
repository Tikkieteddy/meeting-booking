import { describe, expect, it } from 'vitest';
import {
  canCancel,
  checkInWindow,
  isWithinCheckInWindow,
  occupancyLevel,
  timeSlots,
  validateBookingRequest,
  type RoomPolicy,
} from '@/lib/domain/booking-rules';
import { localDateTimeToUtc } from '@/lib/util/time';

const policy: RoomPolicy = {
  id: 'room-1',
  name: 'ห้องประชุมทดสอบ',
  capacity: 10,
  openTime: '08:00',
  closeTime: '20:00',
  openDays: [1, 2, 3, 4, 5],
  slotStepMinutes: 30,
  minDurationMinutes: 30,
  maxDurationMinutes: 240,
  bufferBeforeMinutes: 15,
  bufferAfterMinutes: 15,
  bookingHorizonDays: 90,
  cancelWindowMinutes: 60,
  requiresApproval: false,
  checkInRequired: true,
  checkInGraceMinutes: 15,
  waitlistEnabled: true,
  isActive: true,
};

// 2026-09-15 เป็นวันอังคาร (วันทำการ)
const now = localDateTimeToUtc('2026-09-15', '09:00');
const codes = (violations: { code: string }[]) => violations.map((v) => v.code);

describe('validateBookingRequest', () => {
  it('ผ่านเมื่อข้อมูลถูกต้องทุกข้อ', () => {
    const result = validateBookingRequest({
      policy,
      startsAt: localDateTimeToUtc('2026-09-15', '13:00'),
      endsAt: localDateTimeToUtc('2026-09-15', '14:00'),
      now,
      attendeeCount: 8,
    });
    expect(result).toEqual([]);
  });

  it('ปฏิเสธเวลาสิ้นสุดก่อนเวลาเริ่ม', () => {
    const result = validateBookingRequest({
      policy,
      startsAt: localDateTimeToUtc('2026-09-15', '14:00'),
      endsAt: localDateTimeToUtc('2026-09-15', '13:00'),
      now,
    });
    expect(codes(result)).toContain('start_after_end');
  });

  it('ปฏิเสธการจองย้อนหลัง', () => {
    const result = validateBookingRequest({
      policy,
      startsAt: localDateTimeToUtc('2026-09-15', '07:00'),
      endsAt: localDateTimeToUtc('2026-09-15', '08:00'),
      now,
    });
    expect(codes(result)).toContain('in_the_past');
  });

  it('ปฏิเสธเวลาที่อยู่นอกเวลาทำการ', () => {
    const result = validateBookingRequest({
      policy,
      startsAt: localDateTimeToUtc('2026-09-15', '20:00'),
      endsAt: localDateTimeToUtc('2026-09-15', '21:00'),
      now,
    });
    expect(codes(result)).toContain('outside_open_hours');
  });

  it('ปฏิเสธการจองข้ามวัน', () => {
    const result = validateBookingRequest({
      policy,
      startsAt: localDateTimeToUtc('2026-09-15', '19:00'),
      endsAt: localDateTimeToUtc('2026-09-16', '09:00'),
      now,
    });
    expect(codes(result)).toContain('outside_open_hours');
  });

  it('ปฏิเสธวันที่ห้องปิด (เสาร์-อาทิตย์)', () => {
    const result = validateBookingRequest({
      policy,
      startsAt: localDateTimeToUtc('2026-09-19', '10:00'), // เสาร์
      endsAt: localDateTimeToUtc('2026-09-19', '11:00'),
      now,
    });
    expect(codes(result)).toContain('closed_day');
  });

  it('ปฏิเสธวันหยุดที่ปิดการจอง', () => {
    const result = validateBookingRequest({
      policy,
      startsAt: localDateTimeToUtc('2026-09-16', '10:00'),
      endsAt: localDateTimeToUtc('2026-09-16', '11:00'),
      now,
      blockedDates: ['2026-09-16'],
    });
    expect(codes(result)).toContain('holiday');
  });

  it('ปฏิเสธเวลาที่ไม่ตรงช่วง step 30 นาที', () => {
    const result = validateBookingRequest({
      policy,
      startsAt: localDateTimeToUtc('2026-09-15', '13:10'),
      endsAt: localDateTimeToUtc('2026-09-15', '14:10'),
      now,
    });
    expect(codes(result)).toContain('not_aligned_to_step');
  });

  it('ปฏิเสธระยะเวลาสั้นหรือยาวเกินนโยบายห้อง', () => {
    const tooShort = validateBookingRequest({
      policy: { ...policy, slotStepMinutes: 15 },
      startsAt: localDateTimeToUtc('2026-09-15', '13:00'),
      endsAt: localDateTimeToUtc('2026-09-15', '13:15'),
      now,
    });
    expect(codes(tooShort)).toContain('duration_too_short');

    const tooLong = validateBookingRequest({
      policy,
      startsAt: localDateTimeToUtc('2026-09-15', '10:00'),
      endsAt: localDateTimeToUtc('2026-09-15', '19:00'),
      now,
    });
    expect(codes(tooLong)).toContain('duration_too_long');
  });

  it('ปฏิเสธจำนวนผู้เข้าร่วมเกินความจุ แต่ผู้ดูแลระบบข้ามได้เมื่อมีเหตุผล', () => {
    const blocked = validateBookingRequest({
      policy,
      startsAt: localDateTimeToUtc('2026-09-15', '13:00'),
      endsAt: localDateTimeToUtc('2026-09-15', '14:00'),
      now,
      attendeeCount: 20,
    });
    expect(codes(blocked)).toContain('over_capacity');

    const overridden = validateBookingRequest({
      policy,
      startsAt: localDateTimeToUtc('2026-09-15', '13:00'),
      endsAt: localDateTimeToUtc('2026-09-15', '14:00'),
      now,
      attendeeCount: 20,
      override: { capacity: true, reason: 'ผู้บริหารอนุมัติเป็นกรณีพิเศษ' },
    });
    expect(codes(overridden)).not.toContain('over_capacity');
  });

  it('ปฏิเสธการจองล่วงหน้าเกินกำหนด', () => {
    const result = validateBookingRequest({
      policy: { ...policy, bookingHorizonDays: 7 },
      startsAt: localDateTimeToUtc('2026-10-15', '13:00'),
      endsAt: localDateTimeToUtc('2026-10-15', '14:00'),
      now,
    });
    expect(codes(result)).toContain('too_far_ahead');
  });

  it('ปฏิเสธห้องที่ปิดการใช้งาน', () => {
    const result = validateBookingRequest({
      policy: { ...policy, isActive: false },
      startsAt: localDateTimeToUtc('2026-09-15', '13:00'),
      endsAt: localDateTimeToUtc('2026-09-15', '14:00'),
      now,
    });
    expect(codes(result)).toContain('room_inactive');
  });

  it('อนุญาตการจองที่สิ้นสุดตรงเวลาปิดห้องพอดี', () => {
    const result = validateBookingRequest({
      policy,
      startsAt: localDateTimeToUtc('2026-09-15', '19:00'),
      endsAt: localDateTimeToUtc('2026-09-15', '20:00'),
      now,
    });
    expect(result).toEqual([]);
  });
});

describe('นโยบายการยกเลิกและเช็กอิน', () => {
  it('ยกเลิกได้เมื่อเหลือเวลามากกว่ากำหนด', () => {
    expect(canCancel(policy, localDateTimeToUtc('2026-09-15', '15:00'), now)).toBeNull();
  });

  it('ยกเลิกไม่ได้เมื่อใกล้เวลาประชุมเกินกำหนด', () => {
    const violation = canCancel(policy, localDateTimeToUtc('2026-09-15', '09:30'), now);
    expect(violation?.code).toBe('cancel_too_late');
  });

  it('ช่วงเช็กอินเริ่ม 15 นาทีก่อนเริ่มถึงหมดเวลาผ่อนผัน', () => {
    const startsAt = localDateTimeToUtc('2026-09-15', '13:00');
    const window = checkInWindow(policy, startsAt);
    expect(window.from.toISOString()).toBe(localDateTimeToUtc('2026-09-15', '12:45').toISOString());
    expect(window.to.toISOString()).toBe(localDateTimeToUtc('2026-09-15', '13:15').toISOString());

    expect(isWithinCheckInWindow(policy, startsAt, localDateTimeToUtc('2026-09-15', '12:50'))).toBe(true);
    expect(isWithinCheckInWindow(policy, startsAt, localDateTimeToUtc('2026-09-15', '12:30'))).toBe(false);
    expect(isWithinCheckInWindow(policy, startsAt, localDateTimeToUtc('2026-09-15', '13:20'))).toBe(false);
  });
});

describe('ตัวช่วยอื่น', () => {
  it('สร้างช่วงเวลาที่เลือกได้ตาม step ของห้อง', () => {
    const slots = timeSlots(policy);
    expect(slots[0]).toBe('08:00');
    expect(slots.at(-1)).toBe('19:30');
    expect(slots).toHaveLength(24);
  });

  it('คิดระดับความหนาแน่น 4 ระดับ', () => {
    expect(occupancyLevel(0, 720)).toBe('free');
    expect(occupancyLevel(180, 720)).toBe('partial');
    expect(occupancyLevel(540, 720)).toBe('almost');
    expect(occupancyLevel(700, 720)).toBe('full');
    expect(occupancyLevel(10, 0)).toBe('free');
  });
});
