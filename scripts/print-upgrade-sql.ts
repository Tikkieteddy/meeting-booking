/**
 * พิมพ์คำสั่ง SQL สำหรับ "อัปเดต" ฐานข้อมูลที่ตั้งไว้แล้ว ให้ทันโค้ดรุ่นใหม่
 * โดยไม่ต้องใช้ terminal ต่อฐานข้อมูล — เอาผลไปวางใน SQL Editor ของ Neon ได้เลย
 *
 *   npm run db:upgrade-sql -- 008            # เฉพาะ migration 008
 *   npm run db:upgrade-sql -- 008 009        # หลายตัวตามลำดับ
 *
 * ต่างจาก print-bootstrap-sql.ts ที่ใช้ตอน "ตั้งระบบครั้งแรก" (รันทุก migration)
 * ไฟล์นี้ใช้ตอนมี migration ใหม่เพิ่มเข้ามาหลังจากระบบใช้งานจริงแล้ว
 *
 * สิ่งที่ผลลัพธ์ทำ
 *   1. ยกระดับสิทธิ์เป็นระบบชั่วคราวภายในธุรกรรม (ตารางบังคับ RLS ทุกตาราง)
 *   2. รัน migration ที่ขอ ตามลำดับ ในธุรกรรมเดียว — พังตัวใดตัวหนึ่งจะย้อนทั้งหมด
 *   3. จดใน schema_migrations ว่ารันแล้ว (ถ้าเคยจดไว้แล้วจะข้าม ไม่ซ้ำ)
 *   4. ปิดท้ายด้วยคำสั่งตรวจว่า migration ที่ขอถูกจดครบ
 *
 * ข้อจำกัดที่ต้องรู้: ถ้า migration นั้นเคยรันไปแล้ว การรันซ้ำจะ error ตั้งแต่คำสั่งแรก
 * (เช่น "column already exists") ซึ่งปลอดภัย — ไม่มีอะไรถูกเขียนทับ แต่ต้องรู้ว่า
 * error แบบนั้นแปลว่า "ทำไปแล้ว" ไม่ใช่ "พัง"
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(process.cwd(), 'db', 'migrations');

function lit(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

const wanted = process.argv.slice(2).filter((a) => /^\d+$/.test(a));
if (wanted.length === 0) {
  console.error('ระบุหมายเลข migration อย่างน้อยหนึ่งตัว เช่น: npm run db:upgrade-sql -- 008');
  process.exit(1);
}

const files = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.up.sql'))
  .sort()
  .map((f) => {
    const base = f.replace(/\.up\.sql$/, '');
    return { version: base.split('_')[0] ?? base, name: base, path: join(MIGRATIONS_DIR, f) };
  });

const selected = wanted.map((v) => {
  const m = files.find((f) => f.version === v.padStart(3, '0'));
  if (!m) {
    console.error(`ไม่พบ migration หมายเลข ${v} ใน db/migrations`);
    process.exit(1);
  }
  return m;
});

const out: string[] = [];
out.push('-- ============================================================');
out.push(`-- อัปเดตฐานข้อมูลระบบจองห้องประชุม TNN — migration ${selected.map((m) => m.version).join(', ')}`);
out.push('-- วิธีใช้: เปิด Neon → SQL Editor → วางทั้งไฟล์ → Run');
out.push('-- ทั้งหมดอยู่ในธุรกรรมเดียว ถ้าพังกลางทางจะไม่มีอะไรเปลี่ยน');
out.push('-- ============================================================');
out.push('');
out.push('BEGIN;');
out.push('');
out.push('-- ยกระดับสิทธิ์เป็นระบบเฉพาะในธุรกรรมนี้ (ทุกตารางบังคับ RLS ไว้)');
out.push("SELECT set_config('app.user_role', 'service_role', true);");
out.push('');
for (const m of selected) {
  out.push(`-- ---------- ${m.name} ----------`);
  out.push(readFileSync(m.path, 'utf8').trim());
  out.push('');
  out.push(`INSERT INTO schema_migrations (version, name) VALUES (${lit(m.version)}, ${lit(m.name)})`);
  out.push('  ON CONFLICT (version) DO NOTHING;');
  out.push('');
}
out.push('COMMIT;');
out.push('');
out.push('-- ---------- ตรวจผล: ทุกแถวต้องขึ้น "ผ่าน" ----------');
out.push("SELECT set_config('app.user_role', 'service_role', false);");
out.push('SELECT m.version AS migration,');
out.push("       CASE WHEN s.version IS NULL THEN 'ไม่ผ่าน' ELSE 'ผ่าน' END AS result");
out.push(`FROM (VALUES ${selected.map((m) => `(${lit(m.version)})`).join(', ')}) AS m(version)`);
out.push('LEFT JOIN schema_migrations s ON s.version = m.version');
out.push('ORDER BY m.version;');

process.stdout.write(out.join('\n') + '\n');
