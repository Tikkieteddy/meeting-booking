import { buildFeedForToken, looksLikeFeedToken } from '@/lib/domain/calendar-feed';
import { hashToken } from '@/lib/auth/tokens';
import { consumeRateLimit } from '@/lib/util/rate-limit';
import { logger } from '@/lib/util/logger';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

/**
 * ลิงก์ปฏิทินส่วนตัว (ADR-020) — Outlook/Teams/Google Calendar มาดึงเป็นระยะ โดยไม่มีการล็อกอิน
 * ลิงก์ลับคือสิทธิ์ในการอ่าน จึงไม่ log โทเค็น และตอบ 404 แบบเดียวกันทุกกรณีที่ใช้ไม่ได้
 */
export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token: raw } = await context.params;
  const token = raw.replace(/\.ics$/i, '');
  const notFound = () =>
    new Response('ไม่พบปฏิทินนี้ หรือลิงก์ถูกปิดไปแล้ว — สร้างลิงก์ใหม่ได้ที่หน้าโปรไฟล์', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
    });
  if (!looksLikeFeedToken(token)) return notFound();

  try {
    // กันการดึงถี่ผิดปกติ (Outlook ดึงไม่กี่ครั้งต่อชั่วโมง) — นับตาม hash ไม่ใช่โทเค็นดิบ
    const limit = await consumeRateLimit(`feed:${hashToken(token).slice(0, 24)}`, 120, 3600);
    if (!limit.allowed) {
      return new Response('ดึงปฏิทินถี่เกินไป ลองใหม่ภายหลัง', {
        status: 429,
        headers: { 'retry-after': String(limit.retryAfterSeconds), 'cache-control': 'no-store' },
      });
    }
    const ics = await buildFeedForToken(token, env().NEXT_PUBLIC_APP_URL);
    if (!ics) return notFound();
    return new Response(ics, {
      headers: {
        'content-type': 'text/calendar; charset=utf-8',
        'content-disposition': 'inline; filename="tnn-meeting.ics"',
        // ข้อมูลส่วนตัว — ห้าม proxy/CDN เก็บไว้ให้คนอื่น
        'cache-control': 'private, no-store',
        'x-robots-tag': 'noindex',
      },
    });
  } catch (error) {
    logger.error('สร้างลิงก์ปฏิทินไม่สำเร็จ', { error: (error as Error).message });
    return new Response('ระบบขัดข้องชั่วคราว', { status: 500, headers: { 'cache-control': 'no-store' } });
  }
}
