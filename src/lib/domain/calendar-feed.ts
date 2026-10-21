import 'server-only';
import { withServiceTx, withTx, type DbContext } from '@/lib/db/pool';
import { writeAudit } from '@/lib/audit';
import { hashToken, newToken } from '@/lib/auth/tokens';
import { buildIcsFeed, type IcsEvent } from '@/lib/notify/ics';
import { PG_ERROR, pgErrorCode } from './errors';

/**
 * ลิงก์ปฏิทินส่วนตัว (ADR-020) — ผู้ใช้เพิ่มลิงก์นี้ใน Outlook ครั้งเดียว การจองของเขาขึ้นและอัปเดตเอง
 *
 * ความปลอดภัย:
 *  - โทเค็นสุ่ม 32 ไบต์ เก็บเฉพาะ sha256 — ลิงก์แสดงครั้งเดียวตอนสร้าง ดูซ้ำไม่ได้ ต้องสร้างใหม่
 *  - สร้างใหม่ = ลิงก์เดิมใช้ไม่ได้ทันที (หนึ่งคนหนึ่งลิงก์) ปิดลิงก์ได้ตลอด
 *  - ในปฏิทินมีเฉพาะการจองที่เจ้าของลิงก์ "เป็นผู้จอง" หรือ "ถูกเชิญเป็นผู้เข้าร่วม" (ซึ่งเขาเห็นรายละเอียดได้อยู่แล้ว)
 */
export const FEED_NAME = 'TNN จองห้องประชุม';
/** ช่วงเวลาที่ใส่ในปฏิทิน: ย้อนหลัง 30 วัน ถึงล่วงหน้า 1 ปี (ไฟล์ไม่โตไม่สิ้นสุด) */
const PAST_DAYS = 30;
const FUTURE_DAYS = 366;

export type FeedStatus = { active: boolean; createdAt: string | null; lastAccessedAt: string | null };

export async function getFeedStatus(ctx: DbContext, profileId: string): Promise<FeedStatus> {
  try {
    return await readFeedStatus(ctx, profileId);
  } catch (error) {
    // ฐานข้อมูลยังไม่ได้รัน migration 014 — หน้าโปรไฟล์ต้องไม่พังเพราะส่วนเสริมนี้
    if (pgErrorCode(error) === PG_ERROR.undefinedTable) return { active: false, createdAt: null, lastAccessedAt: null };
    throw error;
  }
}

async function readFeedStatus(ctx: DbContext, profileId: string): Promise<FeedStatus> {
  return withTx(ctx, async (sql) => {
    const res = await sql.query<{ created_at: Date; last_accessed_at: Date | null }>(
      'SELECT created_at, last_accessed_at FROM calendar_feed_tokens WHERE profile_id = $1',
      [profileId],
    );
    const row = res.rows[0];
    return {
      active: Boolean(row),
      createdAt: row?.created_at.toISOString() ?? null,
      lastAccessedAt: row?.last_accessed_at?.toISOString() ?? null,
    };
  });
}

/** สร้างลิงก์ใหม่ (หรือแทนที่ลิงก์เดิม) — คืนโทเค็นดิบครั้งเดียว ห้าม log */
export async function createFeedToken(ctx: DbContext, actor: { profileId: string; email: string }): Promise<string> {
  const token = newToken(32);
  await withTx(ctx, async (sql) => {
    await sql.query(
      `INSERT INTO calendar_feed_tokens (profile_id, token_hash) VALUES ($1, $2)
       ON CONFLICT (profile_id) DO UPDATE SET token_hash = excluded.token_hash, created_at = now(), last_accessed_at = NULL`,
      [actor.profileId, hashToken(token)],
    );
    await writeAudit(sql, {
      actorProfileId: actor.profileId,
      actorEmail: actor.email,
      action: 'calendar_feed.create',
      resourceType: 'profile',
      resourceId: actor.profileId,
    });
  });
  return token;
}

export async function revokeFeedToken(ctx: DbContext, actor: { profileId: string; email: string }): Promise<void> {
  await withTx(ctx, async (sql) => {
    await sql.query('DELETE FROM calendar_feed_tokens WHERE profile_id = $1', [actor.profileId]);
    await writeAudit(sql, {
      actorProfileId: actor.profileId,
      actorEmail: actor.email,
      action: 'calendar_feed.revoke',
      resourceType: 'profile',
      resourceId: actor.profileId,
    });
  });
}

/** โทเค็นต้องเป็น base64url ยาวพอดี — กรองก่อนแตะฐานข้อมูล */
export function looksLikeFeedToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

/**
 * ไฟล์ปฏิทินของเจ้าของโทเค็น — null ถ้าโทเค็นไม่ถูกต้อง/ถูกปิดแล้ว
 * Outlook มาดึงโดยไม่มีการล็อกอิน จึงไม่มีบริบทผู้ใช้ให้ RLS: ใช้สิทธิ์ระบบค้นด้วย hash ของโทเค็น
 * แล้วกรองการจองด้วย profile ของเจ้าของโทเค็นเท่านั้น (ไม่รับข้อมูลอื่นจากคำขอ)
 */
export async function buildFeedForToken(token: string, appUrl: string): Promise<string | null> {
  if (!looksLikeFeedToken(token)) return null;
  return withServiceTx(async (sql) => {
    const owner = await sql.query<{ profile_id: string }>(
      `UPDATE calendar_feed_tokens SET last_accessed_at = now()
        WHERE token_hash = $1
        RETURNING profile_id`,
      [hashToken(token)],
    );
    const profileId = owner.rows[0]?.profile_id;
    if (!profileId) return null;

    const res = await sql.query<{
      id: string;
      title: string;
      purpose: string | null;
      starts_at: Date;
      ends_at: Date;
      status: string;
      version: number;
      room_name: string;
      room_code: string;
      booker_name: string;
      is_booker: boolean;
    }>(
      `SELECT b.id, b.title, b.purpose, b.starts_at, b.ends_at, b.status, b.version,
              r.name AS room_name, r.code AS room_code, b.booker_name,
              b.booker_profile_id = $1 AS is_booker
         FROM bookings b
         JOIN rooms r ON r.id = b.room_id
        WHERE (b.booker_profile_id = $1 OR $1 = ANY (b.attendee_profile_ids))
          AND b.status IN ('pending', 'confirmed', 'checked_in', 'completed')
          AND b.ends_at > now() - make_interval(days => $2)
          AND b.starts_at < now() + make_interval(days => $3)
        ORDER BY b.starts_at`,
      [profileId, PAST_DAYS, FUTURE_DAYS],
    );

    const base = appUrl.replace(/\/$/, '');
    const events: IcsEvent[] = res.rows.map((b) => ({
      // UID เดียวกับไฟล์ .ics ที่ดาวน์โหลดทีละนัด
      uid: `${b.id}@tnn-meeting`,
      title: b.status === 'pending' ? `[รออนุมัติ] ${b.title}` : b.title,
      description: [
        b.purpose,
        b.is_booker ? null : `ผู้จอง: ${b.booker_name}`,
        `รายละเอียด/แก้ไข: ${base}/bookings/${b.id}`,
      ]
        .filter(Boolean)
        .join('\n'),
      location: `${b.room_name} (${b.room_code})`,
      startsAt: b.starts_at,
      endsAt: b.ends_at,
      status: b.status === 'pending' ? 'TENTATIVE' : 'CONFIRMED',
      sequence: b.version,
      url: `${base}/bookings/${b.id}`,
    }));
    return buildIcsFeed(events, { name: FEED_NAME });
  });
}
