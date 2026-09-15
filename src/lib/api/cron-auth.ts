import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env';
import { ForbiddenError } from '@/lib/domain/errors';

/**
 * ตรวจสิทธิ์ endpoint ของ Cron (บรีฟ 22.9)
 * Vercel Cron ส่ง header `authorization: Bearer <CRON_SECRET>`
 * ถ้าไม่ได้ตั้ง CRON_SECRET จะปฏิเสธทุกคำขอ เพื่อไม่ให้เปิดช่องโดยไม่ตั้งใจ
 */
export function assertCronAuthorized(request: Request): void {
  const secret = env().CRON_SECRET;
  if (!secret) throw new ForbiddenError('ยังไม่ได้ตั้งค่า CRON_SECRET จึงปิดการเรียก endpoint นี้ไว้');

  const header = request.headers.get('authorization') ?? request.headers.get('x-cron-secret') ?? '';
  const provided = header.replace(/^Bearer\s+/i, '');
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new ForbiddenError('ไม่มีสิทธิ์เรียก endpoint ของงานตามเวลา');
  }
}
