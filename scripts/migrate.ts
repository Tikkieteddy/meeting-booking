/**
 * ตัวรัน Migration — ใช้ไฟล์ SQL ล้วนใน db/migrations
 *   ไฟล์ขาขึ้น: NNN_name.up.sql      ไฟล์ขาลง (rollback): NNN_name.down.sql
 *
 * วิธีใช้
 *   npm run db:migrate            รัน migration ที่ยังไม่ถูกรัน
 *   npm run db:rollback           ย้อนกลับ migration ล่าสุด 1 ขั้น
 *   npm run db:rollback -- 3      ย้อนกลับ 3 ขั้น
 *   npm run db:migrate -- --reset ย้อนกลับทั้งหมดแล้วรันใหม่ (ห้ามใช้กับ production)
 *   npm run db:migrate -- --status ดูสถานะ
 *
 * ใช้ DIRECT_URL (Session mode พอร์ต 5432) ถ้ามี เพราะ Transaction pooler
 * ไม่รองรับคำสั่งบางอย่างของ DDL — ดู docs/infrastructure-setup.md
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import { loadDotEnv } from './load-env';

loadDotEnv();

const MIGRATIONS_DIR = join(process.cwd(), 'db', 'migrations');

type Migration = { version: string; name: string; upFile: string; downFile: string | null };

function listMigrations(): Migration[] {
  const files = readdirSync(MIGRATIONS_DIR);
  return files
    .filter((f) => f.endsWith('.up.sql'))
    .sort()
    .map((f) => {
      const base = f.replace(/\.up\.sql$/, '');
      const version = base.split('_')[0] ?? base;
      const down = `${base}.down.sql`;
      return {
        version,
        name: base,
        upFile: join(MIGRATIONS_DIR, f),
        downFile: files.includes(down) ? join(MIGRATIONS_DIR, down) : null,
      };
    });
}

function connectionString(): string {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) throw new Error('ต้องตั้งค่า DATABASE_URL (หรือ DIRECT_URL) ก่อนรัน migration');
  return url;
}

async function withClient<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const client = new Client({
    connectionString: connectionString(),
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function ensureTable(client: Client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    text PRIMARY KEY,
      name       text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
}

async function appliedVersions(client: Client): Promise<Set<string>> {
  const res = await client.query<{ version: string }>('SELECT version FROM schema_migrations');
  return new Set(res.rows.map((r) => r.version));
}

async function migrateUp() {
  await withClient(async (client) => {
    await ensureTable(client);
    const applied = await appliedVersions(client);
    const pending = listMigrations().filter((m) => !applied.has(m.version));
    if (pending.length === 0) {
      console.log('✔ ฐานข้อมูลเป็นเวอร์ชันล่าสุดแล้ว ไม่มี migration ค้าง');
      return;
    }
    for (const m of pending) {
      const sql = readFileSync(m.upFile, 'utf8');
      console.log(`→ กำลังรัน ${m.name}`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version, name) VALUES ($1, $2)', [m.version, m.name]);
        await client.query('COMMIT');
        console.log(`  ✔ สำเร็จ ${m.name}`);
      } catch (error) {
        await client.query('ROLLBACK');
        console.error(`  ✘ ล้มเหลว ${m.name}: ${(error as Error).message}`);
        throw error;
      }
    }
    console.log(`✔ รัน migration สำเร็จ ${pending.length} ไฟล์`);
  });
}

async function migrateDown(steps: number) {
  await withClient(async (client) => {
    await ensureTable(client);
    const res = await client.query<{ version: string; name: string }>(
      'SELECT version, name FROM schema_migrations ORDER BY version DESC LIMIT $1',
      [steps],
    );
    if (res.rows.length === 0) {
      console.log('ไม่มี migration ให้ย้อนกลับ');
      return;
    }
    const all = listMigrations();
    for (const row of res.rows) {
      const m = all.find((x) => x.version === row.version);
      if (!m?.downFile) {
        throw new Error(`ไม่พบไฟล์ .down.sql ของ ${row.name} — ย้อนกลับไม่ได้`);
      }
      const sql = readFileSync(m.downFile, 'utf8');
      console.log(`← กำลังย้อนกลับ ${m.name}`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('DELETE FROM schema_migrations WHERE version = $1', [row.version]);
        await client.query('COMMIT');
        console.log(`  ✔ ย้อนกลับแล้ว ${m.name}`);
      } catch (error) {
        await client.query('ROLLBACK');
        console.error(`  ✘ ย้อนกลับล้มเหลว ${m.name}: ${(error as Error).message}`);
        throw error;
      }
    }
  });
}

async function status() {
  await withClient(async (client) => {
    await ensureTable(client);
    const applied = await appliedVersions(client);
    for (const m of listMigrations()) {
      console.log(`${applied.has(m.version) ? '✔ รันแล้ว  ' : '· ยังไม่รัน'} ${m.name}`);
    }
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--status')) return status();

  if (args.includes('--reset')) {
    if (process.env.APP_ENV === 'production') {
      throw new Error('ห้ามรัน --reset บน production');
    }
    await migrateDown(listMigrations().length);
    await migrateUp();
    return;
  }

  if (args.includes('--rollback')) {
    const stepArg = args.find((a) => /^\d+$/.test(a));
    return migrateDown(stepArg ? Number(stepArg) : 1);
  }

  return migrateUp();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
