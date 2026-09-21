import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import { env } from '@/lib/env';
import { logger } from '@/lib/util/logger';

/**
 * การเชื่อมต่อฐานข้อมูล PostgreSQL
 *
 * บทเรียนจากโปรเจกต์เดิม (handoff ข้อ 3.4):
 *   DATABASE_URL ที่เว็บใช้ต้องเป็นเส้นที่วิ่งผ่าน connection pooler โหมด transaction
 *   (บน Neon คือเส้นที่ชื่อ host มี "-pooler") เพราะ serverless เปิด-ปิด connection ถี่
 *   ถ้าใช้เส้นตรง connection จะเต็มโควตาแล้วเว็บล่มตอนคนเข้าพร้อมกัน
 *   ส่วน DIRECT_URL (เส้นตรง) ใช้เฉพาะรัน migration และห้ามใส่ใน Vercel
 *
 *   หมายเหตุสำคัญ: การล็อกห้องใน booking-service ใช้ pg_advisory_xact_lock
 *   ซึ่งเป็นล็อกระดับ transaction จึงทำงานถูกต้องใต้ pooler โหมดนี้
 *   ห้ามเปลี่ยนไปใช้ pg_advisory_lock (ระดับ session) เพราะ pooler สลับ connection
 *   ให้คนอื่นหลังจบ transaction แล้ว ล็อกจะค้างหรือหลุดโดยไม่มีสัญญาณเตือน
 *
 * ความปลอดภัย: ทุก query ที่ทำแทนผู้ใช้ต้องผ่าน withTx() ซึ่งจะตั้งค่า
 * app.user_id / app.user_role ให้ Row Level Security ตรวจสิทธิ์ที่ชั้นฐานข้อมูล
 * (บรีฟข้อ 8: ตรวจ Permission ทั้ง UI API และ Database RLS)
 */

export type Sql = {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount: number }>;
};

export type DbRole = 'anonymous' | 'authenticated' | 'service_role';

export type DbContext = {
  userId: string | null;
  role: DbRole;
  correlationId?: string;
};

export const SERVICE_CONTEXT: DbContext = { userId: null, role: 'service_role' };
export const ANONYMOUS_CONTEXT: DbContext = { userId: null, role: 'anonymous' };

let pool: Pool | null = null;

export function getPool(): Pool {
  if (pool) return pool;
  const cfg = env();
  pool = new Pool({
    connectionString: cfg.DATABASE_URL,
    max: cfg.DATABASE_POOL_MAX,
    // ผู้ให้บริการแบบ serverless (Neon) และ Vercel: ปิด connection ที่ค้างไว้ไม่นาน
    // เพื่อไม่กินโควตาและไม่ถือ connection ของ pooler ไว้เปล่า ๆ
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    ssl: cfg.DATABASE_SSL ? { rejectUnauthorized: false } : undefined,
    application_name: 'tnn-meeting',
  });
  pool.on('error', (err) => logger.error('pool error ที่ client ว่าง', { error: err.message }));
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

function wrap(client: PoolClient): Sql {
  return {
    async query(text, values) {
      const started = Date.now();
      try {
        const res = await client.query(text, values ? [...values] : undefined);
        const ms = Date.now() - started;
        if (ms > 500) logger.warn('query ช้ากว่า 500ms', { ms, sql: text.slice(0, 160) });
        return { rows: res.rows as never[], rowCount: res.rowCount ?? 0 };
      } catch (error) {
        logger.error('query ล้มเหลว', { sql: text.slice(0, 200), error: (error as Error).message });
        throw error;
      }
    },
  };
}

/**
 * รันชุดคำสั่งใน transaction เดียว พร้อมตั้ง context ให้ RLS
 * ใช้ SET LOCAL เพื่อให้ค่าหลุดไปเมื่อ transaction จบ ไม่รั่วข้าม request
 */
export async function withTx<T>(ctx: DbContext, fn: (sql: Sql) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT set_config($1, $2, true)', ['app.user_id', ctx.userId ?? '']);
    await client.query('SELECT set_config($1, $2, true)', ['app.user_role', ctx.role]);
    if (ctx.correlationId) {
      await client.query('SELECT set_config($1, $2, true)', ['app.correlation_id', ctx.correlationId]);
    }
    const result = await fn(wrap(client));
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ถ้า rollback ล้มเหลวให้ปล่อย error เดิมออกไป */
    }
    throw error;
  } finally {
    client.release();
  }
}

/** transaction แบบสิทธิ์ระบบ (migration, seed, cron, job worker) — ไม่ผูกกับผู้ใช้ */
export function withServiceTx<T>(fn: (sql: Sql) => Promise<T>): Promise<T> {
  return withTx(SERVICE_CONTEXT, fn);
}

/** อ่านอย่างเดียวแบบไม่ต้องเปิด transaction ซ้อน — ใช้กับ health check เท่านั้น */
export async function ping(): Promise<boolean> {
  const client = await getPool().connect();
  try {
    await client.query('SELECT 1');
    return true;
  } finally {
    client.release();
  }
}

/**
 * Advisory lock ระดับห้อง — กันสองคำขอที่ตรวจเวลาว่างพร้อมกันเข้ามาชนกัน
 * ใช้ร่วมกับ exclusion constraint ในฐานข้อมูล (กันชั้นสุดท้ายแบบเชื่อถือได้)
 */
export async function lockRoom(sql: Sql, roomId: string): Promise<void> {
  await sql.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [roomId]);
}

/**
 * ยกระดับสิทธิ์เป็น service_role เฉพาะช่วงสั้น ๆ ภายใน transaction เดียวกัน
 *
 * ใช้กับงาน "บัญชีระบบ" ที่ต้องเกิดพร้อมกับธุรกรรมของผู้ใช้แบบ atomic เช่น
 * เขียนคิวแจ้งเตือนถึงผู้อื่น (ผู้เข้าร่วม ผู้อนุมัติ คิวรอ) ซึ่งผู้ใช้ทั่วไป
 * ไม่ควรมีสิทธิ์เขียนตรง ๆ ตาม RLS
 *
 * ข้อกำหนด: ต้องไม่ใช้ครอบคำสั่งที่รับข้อมูลดิบจากผู้ใช้เพื่อเขียนตารางธุรกิจ
 * ให้ใช้เฉพาะงาน bookkeeping ของระบบเท่านั้น และคืนค่าสิทธิ์เดิมทุกกรณี
 */
export async function asService<T>(sql: Sql, fn: () => Promise<T>): Promise<T> {
  const before = await sql.query<{ value: string | null }>(
    "SELECT current_setting('app.user_role', true) AS value",
  );
  const previous = before.rows[0]?.value ?? 'authenticated';
  if (previous === 'service_role') return fn();

  await sql.query('SELECT set_config($1, $2, true)', ['app.user_role', 'service_role']);
  try {
    return await fn();
  } finally {
    await sql.query('SELECT set_config($1, $2, true)', ['app.user_role', previous]);
  }
}
