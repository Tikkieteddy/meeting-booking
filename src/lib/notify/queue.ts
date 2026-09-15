import 'server-only';
import type { Sql } from '@/lib/db/pool';
import { asService, withServiceTx } from '@/lib/db/pool';
import type { NotificationChannel, NotificationEvent, NotificationPayload } from './types';

/**
 * คิวงานแจ้งเตือน (บรีฟข้อ 10 และ 22.9)
 *  - dedupe_key เป็น idempotency key: เหตุการณ์เดิม + ผู้รับเดิม จะไม่ถูกส่งซ้ำ
 *  - งานจริงถูกส่งโดย worker ที่ /api/cron/dispatch-notifications
 *  - retry แบบ exponential backoff และตกเป็น dead letter เมื่อครบจำนวนครั้ง
 */
export type EnqueueInput = {
  eventType: NotificationEvent;
  channel: NotificationChannel;
  recipientProfileId?: string | null;
  recipientAddress?: string | null;
  bookingId?: string | null;
  payload: NotificationPayload;
  /** กำหนดเวลาส่ง (เช่น reminder ล่วงหน้า) ปล่อยว่าง = ส่งทันทีที่ worker ทำงานรอบถัดไป */
  scheduledFor?: Date;
  /** ระบุเองเพื่อกันซ้ำ ถ้าไม่ระบุจะสร้างจาก event + ผู้รับ + booking */
  dedupeKey?: string;
  correlationId?: string | null;
  maxAttempts?: number;
};

export function buildDedupeKey(input: EnqueueInput): string {
  const scheduled = input.scheduledFor ? input.scheduledFor.toISOString() : 'now';
  return [
    input.eventType,
    input.channel,
    input.bookingId ?? '-',
    input.recipientProfileId ?? input.recipientAddress ?? '-',
    scheduled,
  ].join('|');
}

/**
 * ใส่งานลงคิวภายใน transaction ที่มีอยู่ — ถ้าซ้ำจะข้ามโดยไม่ error
 * การเขียนคิวเป็นงานของระบบ จึงยกระดับสิทธิ์ชั่วคราว (ผู้ใช้ทั่วไปเขียนตารางนี้ไม่ได้ตาม RLS)
 */
export async function enqueueNotification(sql: Sql, input: EnqueueInput): Promise<string | null> {
  const dedupeKey = input.dedupeKey ?? buildDedupeKey(input);
  const scheduledFor = input.scheduledFor ?? new Date();
  const res = await asService(sql, () => sql.query<{ id: string }>(
    `INSERT INTO notification_jobs
       (event_type, channel, booking_id, recipient_profile_id, recipient_address,
        payload, dedupe_key, scheduled_for, next_attempt_at, correlation_id, max_attempts)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$8,$9,$10)
     ON CONFLICT (dedupe_key) DO NOTHING
     RETURNING id`,
    [
      input.eventType,
      input.channel,
      input.bookingId ?? null,
      input.recipientProfileId ?? null,
      input.recipientAddress ?? null,
      JSON.stringify(input.payload),
      dedupeKey,
      scheduledFor,
      input.correlationId ?? null,
      input.maxAttempts ?? 5,
    ],
  ));
  return res.rows[0]?.id ?? null;
}

/** ใส่งานลงคิวแบบเปิด transaction ของตัวเอง */
export function enqueueStandalone(input: EnqueueInput): Promise<string | null> {
  return withServiceTx((sql) => enqueueNotification(sql, input));
}

/** ยกเลิกงานที่ยังไม่ถูกส่งของการจองหนึ่ง (เช่น ยกเลิกประชุมแล้วไม่ต้องเตือนอีก) */
export async function cancelPendingJobs(sql: Sql, bookingId: string, events?: NotificationEvent[]): Promise<number> {
  const res = await asService(sql, () => sql.query(
    `UPDATE notification_jobs
        SET status = 'skipped', last_error = 'ยกเลิกเพราะการจองเปลี่ยนสถานะ'
      WHERE booking_id = $1
        AND status = 'queued'
        ${events ? 'AND event_type = ANY($2)' : ''}`,
    events ? [bookingId, events] : [bookingId],
  ));
  return res.rowCount;
}

/** สร้างการแจ้งเตือนในระบบ (in-app) ทันที ไม่ต้องผ่าน worker */
export async function pushInApp(
  sql: Sql,
  input: {
    profileId: string;
    eventType: NotificationEvent;
    title: string;
    body?: string | null;
    link?: string | null;
    bookingId?: string | null;
  },
): Promise<void> {
  await asService(sql, () =>
    sql.query(
      `INSERT INTO in_app_notifications (profile_id, event_type, title, body, link, booking_id)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [input.profileId, input.eventType, input.title, input.body ?? null, input.link ?? null, input.bookingId ?? null],
    ),
  );
}
