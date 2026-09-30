import { describe, it, expect } from 'vitest';
import {
  formatReminderDuration,
  formatReminderLead,
  nextReminderLead,
  normalizeReminderLeads,
  reminderSubject,
  splitReminderLead,
} from '@/lib/domain/reminders';
import { createBookingSchema, notificationPreferenceSchema } from '@/lib/validation/schemas';

describe('เวลาเตือนก่อนประชุม', () => {
  it('แสดงผลเป็นภาษาคน', () => {
    expect(formatReminderLead(0)).toBe('ตอนเริ่มประชุม');
    expect(formatReminderLead(15)).toBe('15 นาทีก่อน');
    expect(formatReminderLead(60)).toBe('1 ชั่วโมงก่อน');
    expect(formatReminderLead(90)).toBe('1 ชั่วโมง 30 นาทีก่อน');
    expect(formatReminderLead(1440)).toBe('1 วันก่อน');
    expect(formatReminderLead(2880)).toBe('2 วันก่อน');
    expect(formatReminderLead(10080)).toBe('1 สัปดาห์ก่อน');
    expect(formatReminderDuration(45)).toBe('45 นาที');
  });

  it('หัวข้อข้อความเตือนบอกว่าอีกนานเท่าไร หรือถึงเวลาแล้ว', () => {
    expect(reminderSubject(10, 'ประชุมข่าวเช้า')).toBe('อีก 10 นาที จะเริ่มประชุม: ประชุมข่าวเช้า');
    expect(reminderSubject(0, 'ประชุมข่าวเช้า')).toBe('ถึงเวลาประชุมแล้ว: ประชุมข่าวเช้า');
  });

  it('ตัดค่าซ้ำ ค่านอกขอบเขต และเรียงจากไกลไปใกล้', () => {
    expect(normalizeReminderLeads([15, 0, 1440, 15, -5, 99999, 1.5])).toEqual([1440, 15, 0]);
    expect(normalizeReminderLeads([1, 2, 3, 4, 5, 6])).toHaveLength(5);
  });

  it('แยกเป็นตัวเลข + หน่วยที่ใหญ่ที่สุดที่หารลงตัว', () => {
    expect(splitReminderLead(90)).toEqual({ amount: 90, unit: 'minute' });
    expect(splitReminderLead(120)).toEqual({ amount: 2, unit: 'hour' });
    expect(splitReminderLead(4320)).toEqual({ amount: 3, unit: 'day' });
    expect(splitReminderLead(10080)).toEqual({ amount: 1, unit: 'week' });
    expect(splitReminderLead(0)).toEqual({ amount: 0, unit: 'minute' });
  });

  it('ปุ่มเพิ่มเลือกค่าที่ยังไม่ได้ใช้ เริ่มที่ 30 นาทีเหมือน Google', () => {
    expect(nextReminderLead([])).toBe(30);
    expect(nextReminderLead([30])).toBe(10);
    expect(nextReminderLead([30, 10])).toBe(60);
  });

  it('schema ของการจองรับได้ไม่เกิน 5 ค่า ไม่เกิน 1 สัปดาห์ และตัดค่าซ้ำให้', () => {
    const base = {
      roomId: '00000000-0000-4000-8000-000000000001',
      title: 'ประชุม',
      dateISO: '2026-10-07',
      startTime: '10:00',
      endTime: '11:00',
      attendeeCount: 1,
    };
    expect(createBookingSchema.parse({ ...base, reminderLeads: [15, 0, 15] }).reminderLeads).toEqual([15, 0]);
    expect(createBookingSchema.parse(base).reminderLeads).toBeUndefined();
    expect(createBookingSchema.safeParse({ ...base, reminderLeads: [1, 2, 3, 4, 5, 6] }).success).toBe(false);
    expect(createBookingSchema.safeParse({ ...base, reminderLeads: [10081] }).success).toBe(false);
    expect(
      notificationPreferenceSchema.parse({ emailEnabled: true, lineEnabled: true, inAppEnabled: true, reminderLeads: [0, 60] })
        .reminderLeads,
    ).toEqual([60, 0]);
  });
});
