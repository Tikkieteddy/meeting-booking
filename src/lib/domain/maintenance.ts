import 'server-only';
import { withServiceTx } from '@/lib/db/pool';
import { enqueueNotification, pushInApp } from '@/lib/notify/queue';
import { purgeOldRateLimits } from '@/lib/util/rate-limit';
import { formatThaiDate, formatTimeRange, toDateISO } from '@/lib/util/time';
import { logger } from '@/lib/util/logger';

/**
 * งานดูแลระบบตามเวลา (บรีฟข้อ 6 และ 22.9)
 * ทุกขั้นตอนเป็น idempotent: รันซ้ำแล้วผลไม่เปลี่ยน จึงเรียกจาก cron ซ้ำได้อย่างปลอดภัย
 */
export type MaintenanceSummary = {
  released: number;
  completed: number;
  waitlistExpired: number;
  waitlistOffered: number;
  tokensPurged: number;
  rateLimitsPurged: number;
  auditPurged: number;
};

export async function runMaintenance(options: { auditRetentionDays?: number } = {}): Promise<MaintenanceSummary> {
  const summary: MaintenanceSummary = {
    released: 0,
    completed: 0,
    waitlistExpired: 0,
    waitlistOffered: 0,
    tokensPurged: 0,
    rateLimitsPurged: 0,
    auditPurged: 0,
  };

  // 1) ปล่อยห้องที่ไม่มีการเช็กอินภายในเวลาผ่อนผัน
  await withServiceTx(async (sql) => {
    const res = await sql.query<{
      id: string;
      title: string;
      starts_at: Date;
      ends_at: Date;
      booker_profile_id: string;
      booker_email: string;
      room_name: string;
      room_id: string;
    }>(
      `UPDATE bookings b
          SET status = 'no_show', version = b.version + 1
         FROM rooms r
        WHERE r.id = b.room_id
          AND b.status = 'confirmed'
          AND r.check_in_required
          AND b.checked_in_at IS NULL
          AND now() > b.starts_at + make_interval(mins => r.check_in_grace_minutes)
        RETURNING b.id, b.title, b.starts_at, b.ends_at, b.booker_profile_id, b.booker_email,
                  r.name AS room_name, r.id AS room_id`,
    );
    summary.released = res.rowCount;

    for (const row of res.rows) {
      const when = `${formatThaiDate(toDateISO(row.starts_at))} ${formatTimeRange(row.starts_at, row.ends_at)}`;
      const payload = {
        subject: `ห้องถูกปล่อยเพราะไม่มีการเช็กอิน: ${row.title}`,
        text: `ห้อง ${row.room_name}\n${when}\nระบบปล่อยห้องคืนให้ผู้อื่นจองได้แล้ว หากยังต้องใช้ห้องกรุณาจองใหม่`,
        link: `/bookings/${row.id}`,
      };
      await enqueueNotification(sql, {
        eventType: 'booking.no_show',
        channel: 'email',
        bookingId: row.id,
        recipientProfileId: row.booker_profile_id,
        recipientAddress: row.booker_email,
        payload,
      });
      await pushInApp(sql, {
        profileId: row.booker_profile_id,
        eventType: 'booking.no_show',
        title: payload.subject,
        body: payload.text,
        link: payload.link,
        bookingId: row.id,
      });
    }
  });

  // 2) ปิดงานการประชุมที่ผ่านไปแล้ว
  await withServiceTx(async (sql) => {
    const res = await sql.query(
      `UPDATE bookings
          SET status = 'completed', version = version + 1
        WHERE status IN ('confirmed', 'checked_in') AND ends_at < now()`,
    );
    summary.completed = res.rowCount;
  });

  // 3) คิวรอที่หมดเวลายืนยัน -> หมดอายุ แล้วเสนอให้คิวถัดไป
  await withServiceTx(async (sql) => {
    const expired = await sql.query<{ id: string; room_id: string; desired_start: Date; desired_end: Date }>(
      `UPDATE waitlist_entries
          SET status = 'expired'
        WHERE status = 'offered' AND offer_expires_at < now()
        RETURNING id, room_id, desired_start, desired_end`,
    );
    summary.waitlistExpired = expired.rowCount;

    for (const row of expired.rows) {
      const next = await sql.query<{ id: string; profile_id: string; desired_start: Date; desired_end: Date }>(
        `SELECT id, profile_id, desired_start, desired_end
           FROM waitlist_entries
          WHERE room_id = $1 AND status = 'waiting'
            AND tstzrange(desired_start, desired_end, '[)') && tstzrange($2, $3, '[)')
          ORDER BY created_at LIMIT 1`,
        [row.room_id, row.desired_start, row.desired_end],
      );
      const entry = next.rows[0];
      if (!entry) continue;

      const expiresAt = new Date(Date.now() + 30 * 60_000);
      await sql.query(
        `UPDATE waitlist_entries SET status = 'offered', offered_at = now(), offer_expires_at = $2 WHERE id = $1`,
        [entry.id, expiresAt],
      );
      const roomName = await sql.query<{ name: string }>('SELECT name FROM rooms WHERE id = $1', [row.room_id]);
      const payload = {
        subject: `มีห้องว่างแล้ว: ${roomName.rows[0]?.name ?? 'ห้องประชุม'}`,
        text: `ช่วงเวลาที่คุณรออยู่ว่างแล้ว\n${formatThaiDate(toDateISO(entry.desired_start))} ${formatTimeRange(
          entry.desired_start,
          entry.desired_end,
        )}\nกรุณายืนยันภายใน 30 นาที`,
        link: `/calendar?room=${row.room_id}&date=${toDateISO(entry.desired_start)}`,
      };
      await enqueueNotification(sql, {
        eventType: 'waitlist.offer',
        channel: 'email',
        recipientProfileId: entry.profile_id,
        payload,
      });
      await pushInApp(sql, {
        profileId: entry.profile_id,
        eventType: 'waitlist.offer',
        title: payload.subject,
        body: payload.text,
        link: payload.link,
      });
      summary.waitlistOffered += 1;
    }
  });

  // 4) ล้างข้อมูลชั่วคราวที่หมดอายุ
  await withServiceTx(async (sql) => {
    const tokens = await sql.query(
      `DELETE FROM auth_tokens WHERE expires_at < now() - interval '7 days' OR used_at < now() - interval '7 days'`,
    );
    summary.tokensPurged = tokens.rowCount;
    await sql.query(`DELETE FROM user_sessions WHERE expires_at < now() - interval '30 days'`);
    await sql.query(`DELETE FROM login_attempts WHERE attempted_at < now() - interval '30 days'`);
  });
  summary.rateLimitsPurged = await purgeOldRateLimits(24);

  // 5) Retention ของ audit log ตามนโยบายองค์กร
  const retentionDays = options.auditRetentionDays ?? 730;
  if (retentionDays > 0) {
    await withServiceTx(async (sql) => {
      const res = await sql.query(`DELETE FROM audit_logs WHERE created_at < now() - make_interval(days => $1)`, [
        retentionDays,
      ]);
      summary.auditPurged = res.rowCount;
    });
  }

  logger.info('งานดูแลระบบทำงานเสร็จ', { ...summary });
  return summary;
}
