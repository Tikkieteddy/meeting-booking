import { describe, expect, it } from 'vitest';
import { guessSearchMode, parseSearchQuery } from '@/lib/domain/parse-query';

const now = new Date('2026-09-15T03:00:00Z'); // 10:00 ตามเวลาไทย

describe('ตีความคำค้นภาษาไทยแบบผสม', () => {
  it('อ่านตัวอย่างในบรีฟได้: "ห้อง 12 คน พรุ่งนี้ 13:00 ถึง 15:00"', () => {
    const parsed = parseSearchQuery('ห้อง 12 คน พรุ่งนี้ 13:00 ถึง 15:00', now);
    expect(parsed).toMatchObject({
      capacity: 12,
      dateISO: '2026-09-16',
      startTime: '13:00',
      endTime: '15:00',
    });
  });

  it('เข้าใจคำว่าวันนี้และมะรืน', () => {
    expect(parseSearchQuery('วันนี้', now).dateISO).toBe('2026-09-15');
    expect(parseSearchQuery('มะรืน', now).dateISO).toBe('2026-09-17');
  });

  it('อ่านวันที่รูปแบบ 15/9 และ พ.ศ. ได้', () => {
    expect(parseSearchQuery('20/9', now).dateISO).toBe('2026-09-20');
    expect(parseSearchQuery('20/9/2569', now).dateISO).toBe('2026-09-20');
  });

  it('อ่านรูปแบบ ISO ได้', () => {
    expect(parseSearchQuery('2026-12-01 10:00', now).dateISO).toBe('2026-12-01');
  });

  it('อ่าน "บ่าย 2" เป็น 14:00', () => {
    expect(parseSearchQuery('บ่าย 2', now).startTime).toBe('14:00');
  });

  it('อ่านระยะเวลาเป็นนาที', () => {
    expect(parseSearchQuery('พรุ่งนี้ 2 ชม.', now).durationMinutes).toBe(120);
    expect(parseSearchQuery('45 นาที', now).durationMinutes).toBe(45);
  });

  it('จับคำอุปกรณ์เป็นรหัส', () => {
    const parsed = parseSearchQuery('ห้องมีทีวี และ ไวท์บอร์ด', now);
    expect(parsed.amenityCodes.sort()).toEqual(['tv', 'whiteboard']);
  });

  it('คืนข้อความที่เหลือเป็นคำค้นชื่อห้อง', () => {
    const parsed = parseSearchQuery('ห้องประชุมใหญ่ 20 คน', now);
    expect(parsed.capacity).toBe(20);
    expect(parsed.text).toContain('ใหญ่');
  });

  it('เดาโหมดการค้นหาได้เหมาะสม', () => {
    expect(guessSearchMode(parseSearchQuery('พรุ่งนี้ 13:00 ถึง 15:00', now))).toBe('slots');
    expect(guessSearchMode(parseSearchQuery('somchai@example.com', now))).toBe('bookings');
    expect(guessSearchMode(parseSearchQuery('ห้องประชุมใหญ่', now))).toBe('rooms');
  });
});
