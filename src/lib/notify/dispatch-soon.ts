import 'server-only';
import { after } from 'next/server';
import { logger } from '@/lib/util/logger';
import { dispatchNotifications } from './worker';

/**
 * ส่งคิวแจ้งเตือนทันทีหลังตอบผู้ใช้แล้ว (ไม่ทำให้การกดจองช้าลง)
 *
 * เดิมงานในคิวถูกส่งเฉพาะตอน cron เรียก /api/cron/dispatch ทุก 5 นาที
 * ผู้ใช้จึงต้องรอ LINE/อีเมลยืนยันนานสุด 5 นาที — ตอนนี้ route ที่สร้างงานแจ้งเตือน
 * เรียกฟังก์ชันนี้ให้ส่งรอบหนึ่งทันที ส่วน cron ยังเป็นตัวสำรอง (ส่งซ้ำงานที่ล้มเหลว
 * และงานเตือนก่อนประชุมที่ตั้งเวลาไว้ล่วงหน้า)
 *
 * ปลอดภัยเมื่อรันพร้อม cron เพราะ worker claim งานด้วย FOR UPDATE SKIP LOCKED
 * ถ้ารอบนี้พัง ไม่กระทบผลการจอง — งานยังอยู่ในคิวให้ cron ส่งรอบถัดไป
 */
export function dispatchSoon(): void {
  after(async () => {
    try {
      await dispatchNotifications(`after-${process.pid}`);
    } catch (error) {
      logger.warn('ส่งแจ้งเตือนทันทีไม่สำเร็จ จะรอ cron รอบถัดไป', { error: (error as Error).message });
    }
  });
}
