import 'server-only';
import { withServiceTx } from '@/lib/db/pool';

/**
 * Rate limit แบบ fixed window เก็บใน PostgreSQL
 * เลือกเก็บในฐานข้อมูลเพราะ Vercel เป็น serverless — ตัวแปรในหน่วยความจำไม่ถูกแชร์ข้าม instance
 * (บรีฟข้อ 15 และ 22.10: จำกัดอัตราสำหรับ Login, Search และ Booking)
 */
export type RateLimitResult = { allowed: boolean; remaining: number; retryAfterSeconds: number };

export async function consumeRateLimit(
  bucket: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = new Date(Math.floor(now / (windowSeconds * 1000)) * windowSeconds * 1000);
  const resetAt = windowStart.getTime() + windowSeconds * 1000;

  return withServiceTx(async (sql) => {
    const res = await sql.query<{ hits: number }>(
      `INSERT INTO rate_limit_counters (bucket, window_start, hits)
       VALUES ($1, $2, 1)
       ON CONFLICT (bucket, window_start)
       DO UPDATE SET hits = rate_limit_counters.hits + 1
       RETURNING hits`,
      [bucket, windowStart],
    );
    const hits = res.rows[0]?.hits ?? 1;
    return {
      allowed: hits <= limit,
      remaining: Math.max(0, limit - hits),
      retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now) / 1000)),
    };
  });
}

/** ลบ counter เก่าทิ้ง เรียกจาก cron cleanup */
export async function purgeOldRateLimits(olderThanHours = 24): Promise<number> {
  return withServiceTx(async (sql) => {
    const res = await sql.query(
      `DELETE FROM rate_limit_counters WHERE window_start < now() - make_interval(hours => $1)`,
      [olderThanHours],
    );
    return res.rowCount;
  });
}
