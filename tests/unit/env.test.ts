import { describe, it, expect } from 'vitest';
import { appUrlFrom } from '@/lib/env';

/**
 * ลิงก์ใน LINE/อีเมลเคยพาไป http://localhost:3000 บน production เพราะไม่ได้ตั้ง NEXT_PUBLIC_APP_URL
 * ตอนนี้ถ้าไม่ได้ตั้ง แต่รันบน Vercel ต้องใช้โดเมน production แทน
 */
describe('ที่อยู่เว็บสำหรับประกอบลิงก์', () => {
  it('ค่าที่ตั้งเองชนะเสมอ', () => {
    expect(
      appUrlFrom({ NEXT_PUBLIC_APP_URL: 'https://meeting.example.com', VERCEL_PROJECT_PRODUCTION_URL: 'x.vercel.app' }),
    ).toBe('https://meeting.example.com');
  });

  it('ไม่ได้ตั้ง แต่อยู่บน Vercel → ใช้โดเมน production แบบ https', () => {
    expect(appUrlFrom({ VERCEL_PROJECT_PRODUCTION_URL: 'tnn-meeting-booking.vercel.app' })).toBe(
      'https://tnn-meeting-booking.vercel.app',
    );
    expect(appUrlFrom({ NEXT_PUBLIC_APP_URL: '  ', VERCEL_PROJECT_PRODUCTION_URL: 'a.vercel.app/' })).toBe(
      'https://a.vercel.app',
    );
  });

  it('ไม่มีทั้งสองค่า → ปล่อยให้ schema ใช้ค่าเริ่มต้นสำหรับเครื่องนักพัฒนา', () => {
    expect(appUrlFrom({})).toBeUndefined();
  });
});
