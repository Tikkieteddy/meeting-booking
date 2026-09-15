import { verifyLineSignature, sendLine } from '@/lib/notify/providers';
import { consumeLinkCode, markLineBlocked, LINK_CODE_MINUTES } from '@/lib/notify/line-link';
import { withApi, apiOk, apiError } from '@/lib/api/respond';
import { logger } from '@/lib/util/logger';

/**
 * Webhook ของ LINE Messaging API (บรีฟ 22.7)
 *  - ตรวจลายเซ็นของทุก request ก่อนประมวลผลเสมอ
 *  - ตอบ 200 ให้ LINE อย่างรวดเร็ว และไม่เปิดเผยข้อมูลภายในใน response
 *  - เนื้อหาข้อความจากผู้ใช้ถือเป็นข้อมูลภายนอก ใช้เทียบรหัสเชื่อมบัญชีเท่านั้น
 */
export const dynamic = 'force-dynamic';

type LineEvent = {
  type: string;
  source?: { userId?: string };
  message?: { type: string; text?: string };
  replyToken?: string;
};

export const POST = withApi(async (request: Request) => {
  const raw = await request.text();
  const signature = request.headers.get('x-line-signature');

  if (!verifyLineSignature(raw, signature)) {
    logger.warn('ปฏิเสธ webhook ของ LINE เพราะลายเซ็นไม่ถูกต้อง');
    return apiError('invalid_signature', 'ลายเซ็นไม่ถูกต้อง', 401);
  }

  let events: LineEvent[] = [];
  try {
    events = (JSON.parse(raw) as { events?: LineEvent[] }).events ?? [];
  } catch {
    return apiError('invalid_payload', 'รูปแบบข้อมูลไม่ถูกต้อง', 400);
  }

  for (const event of events) {
    const lineUserId = event.source?.userId;
    if (!lineUserId) continue;

    if (event.type === 'unfollow') {
      await markLineBlocked(lineUserId);
      continue;
    }

    if (event.type === 'message' && event.message?.type === 'text') {
      const text = (event.message.text ?? '').trim();
      // รหัสเชื่อมบัญชีเป็นตัวอักษรพิมพ์ใหญ่กับตัวเลข 8 ตัว
      if (/^[A-Za-z0-9]{8}$/.test(text)) {
        const result = await consumeLinkCode(text, lineUserId);
        await sendLine(
          lineUserId,
          result.linked ? 'auth.invite' : 'auth.verify_email',
          result.linked
            ? {
                subject: 'เชื่อมบัญชีสำเร็จ',
                text: 'เชื่อมบัญชี LINE กับระบบจองห้องประชุม TNN สำเร็จแล้ว คุณจะได้รับแจ้งเตือนการจองทางนี้',
              }
            : {
                subject: 'รหัสไม่ถูกต้อง',
                text: `รหัสไม่ถูกต้องหรือหมดอายุแล้ว กรุณาขอรหัสใหม่จากหน้าโปรไฟล์ในระบบ (รหัสมีอายุ ${LINK_CODE_MINUTES} นาที)`,
              },
        );
        continue;
      }

      await sendLine(lineUserId, 'auth.verify_email', {
        subject: 'วิธีเชื่อมบัญชี',
        text: 'พิมพ์รหัสเชื่อมบัญชี 8 ตัวที่ได้จากหน้าโปรไฟล์ในระบบจองห้องประชุม TNN เพื่อรับการแจ้งเตือนทาง LINE',
      });
    }
  }

  return apiOk({ received: events.length });
});
