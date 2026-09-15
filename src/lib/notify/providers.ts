import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env';
import { logger } from '@/lib/util/logger';
import { renderEmail, renderLineMessage } from './templates';
import type { NotificationEvent, NotificationPayload, SendResult } from './types';
import { buildIcs, type IcsEvent } from './ics';

/**
 * Adapter สำหรับผู้ให้บริการภายนอก (บรีฟข้อ 21)
 * ถ้ายังไม่มี credential ให้ใช้ provider แบบ 'log' ซึ่งบันทึกลง log และฐานข้อมูลจริง
 * ทำให้ทดสอบ flow ทั้งหมดได้โดยไม่ต้องต่อของจริง และสลับเป็นของจริงได้ด้วยการตั้ง env
 */

export type EmailMessage = {
  to: string;
  event: NotificationEvent;
  payload: NotificationPayload;
  ics?: IcsEvent | null;
};

export async function sendEmail(message: EmailMessage): Promise<SendResult> {
  const cfg = env();
  const { subject, html, text } = renderEmail(message.event, message.payload, cfg.NEXT_PUBLIC_APP_URL);

  if (cfg.EMAIL_PROVIDER === 'log' || !cfg.EMAIL_API_KEY) {
    logger.info('[email:log] จำลองการส่งอีเมล', { to: message.to, subject, event: message.event });
    return { ok: true, provider: 'log', providerMessageId: `log-${Date.now()}` };
  }

  try {
    const attachments = message.ics
      ? [
          {
            filename: 'meeting.ics',
            content: Buffer.from(buildIcs(message.ics), 'utf8').toString('base64'),
            content_type: 'text/calendar; method=REQUEST',
          },
        ]
      : undefined;

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${cfg.EMAIL_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: cfg.EMAIL_FROM,
        to: [message.to],
        subject,
        html,
        text,
        ...(cfg.EMAIL_REPLY_TO ? { reply_to: cfg.EMAIL_REPLY_TO } : {}),
        ...(attachments ? { attachments } : {}),
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      // 4xx = ข้อมูลผิด ไม่ต้อง retry | 5xx และ 429 = ลองใหม่ได้
      const retryable = response.status >= 500 || response.status === 429;
      return { ok: false, provider: 'resend', error: `HTTP ${response.status}: ${detail.slice(0, 200)}`, retryable };
    }
    const data = (await response.json()) as { id?: string };
    return { ok: true, provider: 'resend', providerMessageId: data.id };
  } catch (error) {
    return { ok: false, provider: 'resend', error: (error as Error).message, retryable: true };
  }
}

export async function sendLine(lineUserId: string, event: NotificationEvent, payload: NotificationPayload): Promise<SendResult> {
  const cfg = env();
  const text = renderLineMessage(event, payload, cfg.NEXT_PUBLIC_APP_URL);

  if (cfg.LINE_PROVIDER === 'log' || !cfg.LINE_CHANNEL_ACCESS_TOKEN) {
    logger.info('[line:log] จำลองการส่ง LINE', { to: lineUserId.slice(0, 6) + '***', event });
    return { ok: true, provider: 'log', providerMessageId: `log-${Date.now()}` };
  }

  try {
    const response = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${cfg.LINE_CHANNEL_ACCESS_TOKEN}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ to: lineUserId, messages: [{ type: 'text', text: text.slice(0, 4900) }] }),
    });
    if (!response.ok) {
      const detail = await response.text();
      const retryable = response.status >= 500 || response.status === 429;
      return { ok: false, provider: 'line', error: `HTTP ${response.status}: ${detail.slice(0, 200)}`, retryable };
    }
    return { ok: true, provider: 'line', providerMessageId: response.headers.get('x-line-request-id') ?? undefined };
  } catch (error) {
    return { ok: false, provider: 'line', error: (error as Error).message, retryable: true };
  }
}

/** ตรวจลายเซ็น webhook ของ LINE — ต้องตรวจทุก request ก่อนประมวลผล (บรีฟ 22.7) */
export function verifyLineSignature(rawBody: string, signature: string | null): boolean {
  const secret = env().LINE_CHANNEL_SECRET;
  if (!secret || !signature) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('base64');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** ตรวจลายเซ็น webhook ของผู้ให้บริการอีเมล (bounce / complaint) */
export function verifyEmailWebhookSignature(rawBody: string, signature: string | null): boolean {
  const secret = env().EMAIL_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature.replace(/^sha256=/, ''));
  return a.length === b.length && timingSafeEqual(a, b);
}
