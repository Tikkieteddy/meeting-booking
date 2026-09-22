import 'server-only';
import { buildMapLink, effectiveLocation, hasCoordinates } from '@/lib/domain/map-link';
import { withServiceTx, type Sql } from '@/lib/db/pool';
import { logger } from '@/lib/util/logger';
import { sendEmail, sendLine } from './providers';
import type { NotificationChannel, NotificationEvent, NotificationPayload } from './types';
import type { IcsEvent } from './ics';

/**
 * Worker ส่งการแจ้งเตือน (บรีฟข้อ 10 และ 22.9)
 *  - claim งานด้วย FOR UPDATE SKIP LOCKED จึงรันหลายตัวพร้อมกันได้โดยไม่ส่งซ้ำ
 *  - retry แบบ exponential backoff และตกเป็น dead letter เมื่อครบจำนวนครั้ง
 *  - บันทึกผลทุกครั้งลง notification_deliveries เพื่อให้ตรวจย้อนหลังได้
 */

const CLAIM_BATCH = 25;
const STUCK_MINUTES = 10;

type JobRow = {
  id: string;
  event_type: NotificationEvent;
  channel: NotificationChannel;
  booking_id: string | null;
  recipient_profile_id: string | null;
  recipient_address: string | null;
  payload: NotificationPayload;
  attempts: number;
  max_attempts: number;
};

export type DispatchSummary = {
  claimed: number;
  sent: number;
  failed: number;
  dead: number;
  skipped: number;
  reclaimed: number;
};

function backoffMinutes(attempts: number): number {
  // 1, 2, 4, 8, 16 ... สูงสุด 60 นาที
  return Math.min(60, 2 ** Math.max(0, attempts - 1));
}

async function reclaimStuck(sql: Sql): Promise<number> {
  const res = await sql.query(
    `UPDATE notification_jobs
        SET status = 'queued', locked_at = NULL, locked_by = NULL,
            last_error = 'งานค้างในสถานะ processing นานเกินกำหนด จึงนำกลับเข้าคิว'
      WHERE status = 'processing' AND locked_at < now() - make_interval(mins => $1)`,
    [STUCK_MINUTES],
  );
  return res.rowCount;
}

async function claimJobs(sql: Sql, workerId: string, limit: number): Promise<JobRow[]> {
  const res = await sql.query<JobRow>(
    `UPDATE notification_jobs j
        SET status = 'processing', locked_at = now(), locked_by = $1
      WHERE j.id IN (
        SELECT id FROM notification_jobs
         WHERE status IN ('queued', 'failed')
           AND next_attempt_at <= now()
           AND scheduled_for <= now()
         ORDER BY next_attempt_at
         FOR UPDATE SKIP LOCKED
         LIMIT $2
      )
      RETURNING j.id, j.event_type, j.channel, j.booking_id, j.recipient_profile_id,
                j.recipient_address, j.payload, j.attempts, j.max_attempts`,
    [workerId, limit],
  );
  return res.rows;
}

async function resolveRecipient(
  sql: Sql,
  job: JobRow,
): Promise<{ address: string | null; skipReason: string | null; icsEvent: IcsEvent | null }> {
  let address = job.recipient_address;

  if (job.channel === 'email') {
    if (!address && job.recipient_profile_id) {
      const res = await sql.query<{ email: string; email_enabled: boolean }>(
        `SELECT p.email, coalesce(np.email_enabled, true) AS email_enabled
           FROM profiles p LEFT JOIN notification_preferences np ON np.profile_id = p.id
          WHERE p.id = $1`,
        [job.recipient_profile_id],
      );
      const row = res.rows[0];
      if (!row) return { address: null, skipReason: 'ไม่พบผู้รับ', icsEvent: null };
      if (!row.email_enabled) return { address: null, skipReason: 'ผู้รับปิดการแจ้งเตือนทางอีเมล', icsEvent: null };
      address = row.email;
    }
    if (address) {
      const suppressed = await sql.query<{ reason: string }>('SELECT reason FROM email_suppressions WHERE email = $1', [
        address.toLowerCase(),
      ]);
      const reason = suppressed.rows[0]?.reason;
      if (reason) return { address: null, skipReason: `อีเมลอยู่ในรายการระงับการส่ง (${reason})`, icsEvent: null };
    }
  }

  if (job.channel === 'line') {
    if (!job.recipient_profile_id) return { address: null, skipReason: 'ไม่ได้ระบุผู้รับ', icsEvent: null };
    const res = await sql.query<{ line_user_id: string | null; status: string; line_enabled: boolean }>(
      `SELECT ll.line_user_id, ll.status, coalesce(np.line_enabled, false) AS line_enabled
         FROM line_links ll
         LEFT JOIN notification_preferences np ON np.profile_id = ll.profile_id
        WHERE ll.profile_id = $1`,
      [job.recipient_profile_id],
    );
    const row = res.rows[0];
    if (!row || row.status !== 'linked' || !row.line_user_id) {
      return { address: null, skipReason: 'ผู้รับยังไม่ได้เชื่อมบัญชี LINE', icsEvent: null };
    }
    if (!row.line_enabled) return { address: null, skipReason: 'ผู้รับปิดการแจ้งเตือนทาง LINE', icsEvent: null };
    address = row.line_user_id;
  }

  // แนบไฟล์ปฏิทินเมื่อ payload ขอไว้และงานผูกกับการจอง
  let icsEvent: IcsEvent | null = null;
  if (job.channel === 'email' && job.payload.attachIcs && job.booking_id) {
    const res = await sql.query<{
      id: string;
      title: string;
      starts_at: Date;
      ends_at: Date;
      room_name: string;
      room_code: string;
      booker_email: string;
      booker_name: string;
      version: number;
      status: string;
      map_url: string | null;
      latitude: number | null;
      longitude: number | null;
      building_map_url: string | null;
      building_latitude: number | null;
      building_longitude: number | null;
    }>(
      `SELECT b.id, b.title, b.starts_at, b.ends_at, r.name AS room_name, r.code AS room_code,
              b.booker_email, b.booker_name, b.version, b.status,
              r.map_url, r.latitude, r.longitude,
              bd.map_url AS building_map_url, bd.latitude AS building_latitude, bd.longitude AS building_longitude
         FROM bookings b
         JOIN rooms r ON r.id = b.room_id
         LEFT JOIN buildings bd ON bd.id = r.building_id
        WHERE b.id = $1`,
      [job.booking_id],
    );
    const row = res.rows[0];
    if (row) {
      const location = effectiveLocation(
        { mapUrl: row.map_url, latitude: row.latitude, longitude: row.longitude },
        { mapUrl: row.building_map_url, latitude: row.building_latitude, longitude: row.building_longitude },
      );
      const mapLink = buildMapLink(location);
      icsEvent = {
        uid: `${row.id}@tnn-meeting`,
        title: row.title,
        location: `${row.room_name} (${row.room_code})`,
        description: mapLink ? `แผนที่: ${mapLink}` : null,
        geo: hasCoordinates(location) ? { latitude: location.latitude, longitude: location.longitude } : null,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        organizerEmail: row.booker_email,
        organizerName: row.booker_name,
        sequence: row.version,
        status: row.status === 'cancelled' ? 'CANCELLED' : row.status === 'pending' ? 'TENTATIVE' : 'CONFIRMED',
      };
    }
  }

  return { address: address ?? null, skipReason: null, icsEvent };
}

async function recordDelivery(
  sql: Sql,
  jobId: string,
  attempt: number,
  outcome: 'sent' | 'failed' | 'skipped',
  provider: string | null,
  providerMessageId: string | null,
  detail: string | null,
) {
  await sql.query(
    `INSERT INTO notification_deliveries (job_id, attempt, outcome, provider, provider_message_id, detail)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [jobId, attempt, outcome, provider, providerMessageId, detail?.slice(0, 500) ?? null],
  );
}

/** ประมวลผลคิวหนึ่งรอบ — เรียกจาก /api/cron/dispatch */
export async function dispatchNotifications(workerId = `worker-${process.pid}`): Promise<DispatchSummary> {
  const summary: DispatchSummary = { claimed: 0, sent: 0, failed: 0, dead: 0, skipped: 0, reclaimed: 0 };

  summary.reclaimed = await withServiceTx((sql) => reclaimStuck(sql));
  const jobs = await withServiceTx((sql) => claimJobs(sql, workerId, CLAIM_BATCH));
  summary.claimed = jobs.length;

  for (const job of jobs) {
    const attempt = job.attempts + 1;
    try {
      await withServiceTx(async (sql) => {
        const { address, skipReason, icsEvent } = await resolveRecipient(sql, job);

        if (skipReason || !address) {
          await sql.query(
            `UPDATE notification_jobs SET status = 'skipped', attempts = $2, last_error = $3 WHERE id = $1`,
            [job.id, attempt, skipReason ?? 'ไม่พบที่อยู่ผู้รับ'],
          );
          await recordDelivery(sql, job.id, attempt, 'skipped', null, null, skipReason);
          summary.skipped += 1;
          return;
        }

        const result =
          job.channel === 'email'
            ? await sendEmail({ to: address, event: job.event_type, payload: job.payload, ics: icsEvent })
            : await sendLine(address, job.event_type, job.payload);

        if (result.ok) {
          await sql.query(
            `UPDATE notification_jobs
                SET status = 'sent', attempts = $2, sent_at = now(),
                    provider_message_id = $3, last_error = NULL, locked_at = NULL, locked_by = NULL
              WHERE id = $1`,
            [job.id, attempt, result.providerMessageId ?? null],
          );
          await recordDelivery(sql, job.id, attempt, 'sent', result.provider, result.providerMessageId ?? null, null);
          summary.sent += 1;
          return;
        }

        const exhausted = attempt >= job.max_attempts || !result.retryable;
        await sql.query(
          `UPDATE notification_jobs
              SET status = $4, attempts = $2, last_error = $3,
                  next_attempt_at = now() + make_interval(mins => $5),
                  locked_at = NULL, locked_by = NULL
            WHERE id = $1`,
          [job.id, attempt, result.error, exhausted ? 'dead' : 'failed', exhausted ? 0 : backoffMinutes(attempt)],
        );
        await recordDelivery(sql, job.id, attempt, 'failed', result.provider, null, result.error);
        if (exhausted) summary.dead += 1;
        else summary.failed += 1;
      });
    } catch (error) {
      logger.error('ประมวลผลงานแจ้งเตือนล้มเหลว', { jobId: job.id, error: (error as Error).message });
      await withServiceTx((sql) =>
        sql.query(
          `UPDATE notification_jobs
              SET status = CASE WHEN $2 >= max_attempts THEN 'dead' ELSE 'failed' END,
                  attempts = $2, last_error = $3,
                  next_attempt_at = now() + make_interval(mins => $4),
                  locked_at = NULL, locked_by = NULL
            WHERE id = $1`,
          [job.id, attempt, (error as Error).message.slice(0, 300), backoffMinutes(attempt)],
        ),
      );
      summary.failed += 1;
    }
  }

  return summary;
}

/** สั่งส่งงานที่ล้มเหลวหรือตายแล้วอีกครั้ง (ใช้จากหน้า Admin) */
export async function requeueJob(jobId: string): Promise<boolean> {
  return withServiceTx(async (sql) => {
    const res = await sql.query(
      `UPDATE notification_jobs
          SET status = 'queued', attempts = 0, next_attempt_at = now(), last_error = NULL,
              locked_at = NULL, locked_by = NULL
        WHERE id = $1 AND status IN ('failed', 'dead', 'skipped')`,
      [jobId],
    );
    return res.rowCount > 0;
  });
}
