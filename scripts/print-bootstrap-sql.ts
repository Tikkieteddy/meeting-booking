/**
 * พิมพ์ SQL ชุดเดียวที่เตรียมฐานข้อมูล production ให้พร้อมใช้งาน
 *
 * ใช้เมื่อ **ไม่สะดวกรันคำสั่งจาก terminal** เช่นผู้ดูแลระบบเป็นคนที่ไม่เขียนโค้ด
 * ให้เอาผลลัพธ์ไปวางใน SQL Editor ของผู้ให้บริการฐานข้อมูล (Neon) แล้วกดรันครั้งเดียว
 *
 *   npm run db:bootstrap-sql > bootstrap.sql
 *
 * ผลลัพธ์ใช้ได้กับ **ฐานข้อมูลเปล่า** เท่านั้น ทุกคำสั่งอยู่ในธุรกรรมเดียว
 * ถ้ารันซ้ำบนฐานข้อมูลที่มีตารางแล้วจะ error และย้อนกลับทั้งหมด ไม่ทำข้อมูลเสียหาย
 *
 * สิ่งที่ SQL ชุดนี้ทำ
 *   1. สร้างตารางทั้งหมดจากไฟล์ใน db/migrations (ไฟล์ .up.sql เรียงตามเลข)
 *   2. จดใน schema_migrations ว่า migration ทุกไฟล์ถูกรันแล้ว
 *      เพื่อให้ `npm run db:migrate` ในอนาคตไม่รันซ้ำ และรัน migration ใหม่ต่อได้ถูกจุด
 *   3. ใส่ข้อมูลตั้งต้นที่ระบบต้องมีถึงจะทำงานได้ — องค์กร 1 แถว, roles,
 *      permissions และการจับคู่ role กับ permission
 *
 * สิ่งที่ SQL ชุดนี้ **ไม่** ทำ — ไม่ใส่ผู้ใช้ตัวอย่าง ห้องตัวอย่าง หรือการจองตัวอย่าง
 * (ต่างจาก `npm run db:seed` ซึ่งมีข้อมูลตัวอย่างและห้ามใช้กับ production)
 *
 * ทำไมต้องมีข้อ 3: การสมัครสมาชิกจะล้มเหลวด้วยข้อความ "ยังไม่ได้ตั้งค่าองค์กรในระบบ"
 * ถ้าไม่มีแถวในตาราง organizations และตาราง user_roles มี foreign key ไปที่
 * roles(code) จึงต้องมี roles ก่อนถึงจะให้บทบาทใครได้
 */
import { readFileSync, readdirSync } from 'node:fs';
import { AMENITY_CATALOG, amenityUpsertSql } from '../src/lib/domain/amenity-catalog';
import { join } from 'node:path';
import { ALL_ROLES, ROLES, PERMISSIONS, ROLE_PERMISSIONS } from '../src/lib/rbac/permissions';

const MIGRATIONS_DIR = join(process.cwd(), 'db', 'migrations');

/** ชื่อองค์กรเริ่มต้น เปลี่ยนได้ด้วย ORG_NAME / ORG_SLUG ตอนรันสคริปต์ */
const ORG_NAME = process.env.ORG_NAME ?? 'องค์กรของฉัน (แก้ชื่อนี้ได้ภายหลังในหน้าตั้งค่า)';
const ORG_SLUG = process.env.ORG_SLUG ?? 'main';

/** ใส่เครื่องหมายคำพูดให้ค่าที่จะฝังใน SQL — escape ตามกฎของ PostgreSQL */
function lit(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function migrationFiles(): { version: string; name: string; sql: string }[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.up.sql'))
    .sort()
    .map((file) => {
      const base = file.replace(/\.up\.sql$/, '');
      const version = base.slice(0, base.indexOf('_'));
      const name = base.slice(base.indexOf('_') + 1);
      return { version, name, sql: readFileSync(join(MIGRATIONS_DIR, file), 'utf8').trimEnd() };
    });
}

/**
 * คำสั่งตรวจผล — คืนตารางแถวเดียวต่อรายการ พร้อมคอลัมน์ "ผล" ที่คิดให้แล้ว
 * รวมเป็นคำสั่ง SQL เดียวโดยเจตนา เพราะหน้าเว็บ SQL Editor ส่วนใหญ่
 * แสดงผลของคำสั่งสุดท้ายเท่านั้น ถ้าแยกหลายคำสั่งผู้ใช้จะเห็นผลไม่ครบ
 */
function checkSql(migrationCount: number): string[] {
  const out: string[] = [];
  out.push('-- ต้องยกระดับสิทธิ์ก่อน เพราะระบบกันข้อมูลข้ามผู้ใช้ซ่อนแถวไว้');
  out.push('-- จากคนที่ไม่ได้ล็อกอิน ถ้าไม่ตั้งจะนับได้ 0 ทุกตารางทั้งที่ข้อมูลมีอยู่');
  out.push("SELECT set_config('app.user_role', 'service_role', false);");
  out.push('');
  const checks: { label: string; expected: number; from: string }[] = [
    { label: 'ตารางถูกสร้างครบ', expected: migrationCount, from: 'SELECT count(*) FROM schema_migrations' },
    { label: 'ข้อมูลองค์กร', expected: 1, from: 'SELECT count(*) FROM organizations' },
    { label: 'บทบาทผู้ใช้', expected: ALL_ROLES.length, from: 'SELECT count(*) FROM roles' },
    { label: 'สิ่งอำนวยความสะดวก', expected: AMENITY_CATALOG.length, from: 'SELECT count(*) FROM amenities' },
    {
      label: 'สิทธิ์การใช้งาน',
      expected: Object.keys(PERMISSIONS).length,
      from: 'SELECT count(*) FROM permissions',
    },
    {
      label: 'ตัวกันจองห้องซ้อนกัน',
      expected: 1,
      from: "SELECT count(*) FROM pg_constraint WHERE conname = 'bookings_no_overlap'",
    },
    {
      label: 'ส่วนขยายฐานข้อมูล',
      expected: 2,
      from: "SELECT count(*) FROM pg_extension WHERE extname IN ('pgcrypto','btree_gist')",
    },
    {
      label: 'ตารางที่กันข้อมูลข้ามผู้ใช้',
      expected: 6,
      from:
        "SELECT count(*) FROM pg_class WHERE relrowsecurity AND relforcerowsecurity AND relname IN " +
        "('bookings','profiles','audit_logs','rooms','user_roles','notification_jobs')",
    },
  ];

  out.push('SELECT');
  out.push('  "ลำดับ", "รายการที่ตรวจ", "นับได้", "ต้องได้",');
  out.push('  CASE WHEN "นับได้" = "ต้องได้" THEN \'ผ่าน\' ELSE \'ไม่ผ่าน — แจ้งนักพัฒนา\' END AS "ผล"');
  out.push('FROM (');
  checks.forEach((c, i) => {
    const comma = i === checks.length - 1 ? '' : ' UNION ALL';
    out.push(
      `  SELECT ${i + 1} AS "ลำดับ", ${lit(c.label)} AS "รายการที่ตรวจ", (${c.from}) AS "นับได้", ${c.expected} AS "ต้องได้"${comma}`,
    );
  });
  out.push(') AS ผลการตรวจ');
  out.push('ORDER BY "ลำดับ";');
  return out;
}

/** โหมด --check-only: พิมพ์เฉพาะคำสั่งตรวจผล ปลอดภัยกับฐานข้อมูลที่มีข้อมูลอยู่แล้ว */
const CHECK_ONLY = process.argv.includes('--check-only');

function main() {
  const files = migrationFiles();
  const out: string[] = [];

  if (CHECK_ONLY) {
    out.push('--');
    out.push('-- ตรวจว่าฐานข้อมูลพร้อมใช้งานหรือยัง');
    out.push('--');
    out.push('-- คำสั่งชุดนี้ **อ่านอย่างเดียว** ไม่สร้าง ไม่แก้ ไม่ลบอะไรเลย');
    out.push('-- รันซ้ำได้ตลอด ปลอดภัยกับฐานข้อมูลที่มีข้อมูลจริงอยู่แล้ว');
    out.push('--');
    out.push('-- วิธีใช้: วางใน SQL Editor ของ Neon แล้วกด Run');
    out.push('-- ดูคอลัมน์ขวาสุด ต้องขึ้นคำว่า ผ่าน ทุกแถว');
    out.push('--');
    out.push('');
    out.push(...checkSql(files.length));
    process.stdout.write(out.join('\n') + '\n');
    return;
  }

  out.push('--');
  out.push('-- ระบบจองห้องประชุม TNN — SQL เตรียมฐานข้อมูลสำหรับใช้งานจริง');
  out.push('--');
  out.push('-- วิธีใช้: copy ทั้งไฟล์นี้ไปวางใน SQL Editor ของ Neon แล้วกด Run ครั้งเดียว');
  out.push('-- ใช้เวลาไม่เกิน 30 วินาที');
  out.push('--');
  out.push('-- ★ ใช้กับฐานข้อมูลเปล่าเท่านั้น (ฐานข้อมูลที่เพิ่งสร้างใหม่)');
  out.push('--   ถ้าเผลอรันซ้ำบนฐานข้อมูลที่มีตารางอยู่แล้ว จะขึ้น error ว่าตารางมีอยู่แล้ว');
  out.push('--   และ **ไม่มีอะไรเปลี่ยนแปลง** เพราะทุกคำสั่งอยู่ในธุรกรรมเดียวที่ย้อนกลับทั้งหมด');
  out.push('--   จึงปลอดภัย แค่ต้องอ่าน error ให้เข้าใจว่าไม่ใช่เรื่องเสียหาย');
  out.push('--');
  out.push('-- ไฟล์นี้สร้างอัตโนมัติจาก db/migrations และ src/lib/rbac/permissions.ts');
  out.push('-- ห้ามแก้ด้วยมือ — ถ้าต้องแก้ ให้แก้ต้นทางแล้วสร้างใหม่ด้วย npm run db:bootstrap-sql');
  out.push('--');
  out.push('');
  out.push('BEGIN;');
  out.push('');
  out.push('-- ' + '='.repeat(72));
  out.push('-- ยกระดับสิทธิ์ของธุรกรรมนี้เป็น "ระบบ"');
  out.push('-- ' + '='.repeat(72));
  out.push('-- ตารางข้อมูลทุกตารางเปิดการกันข้อมูลข้ามผู้ใช้แบบบังคับ (FORCE ROW LEVEL SECURITY)');
  out.push('-- ซึ่งบังคับกับเจ้าของตารางด้วย ถ้าไม่ตั้งค่าบรรทัดล่างนี้ การใส่ข้อมูลตั้งต้น');
  out.push('-- จะถูกปฏิเสธด้วยข้อความ new row violates row-level security policy');
  out.push('--');
  out.push('-- ค่า true ท้ายคำสั่งทำให้มีผลเฉพาะในธุรกรรมนี้ จบแล้วหมดผลทันที');
  out.push("SELECT set_config('app.user_role', 'service_role', true);");
  out.push('');

  // ── ตารางจดประวัติการรัน migration ──
  out.push('-- ตารางจดว่า migration ไฟล์ไหนถูกรันไปแล้ว');
  out.push('CREATE TABLE IF NOT EXISTS schema_migrations (');
  out.push('  version    text PRIMARY KEY,');
  out.push('  name       text NOT NULL,');
  out.push('  applied_at timestamptz NOT NULL DEFAULT now()');
  out.push(');');
  out.push('');

  // ── เนื้อ migration แต่ละไฟล์ ──
  for (const m of files) {
    out.push('-- ' + '='.repeat(72));
    out.push(`-- migration ${m.version} — ${m.name}`);
    out.push('-- ' + '='.repeat(72));
    out.push(m.sql);
    out.push('');
    out.push(
      `INSERT INTO schema_migrations (version, name) VALUES (${lit(m.version)}, ${lit(m.name)})`,
    );
    out.push('  ON CONFLICT (version) DO NOTHING;');
    out.push('');
  }

  // ── ข้อมูลตั้งต้นที่ระบบต้องมี ──
  out.push('-- ' + '='.repeat(72));
  out.push('-- ข้อมูลตั้งต้นที่ระบบต้องมีถึงจะทำงานได้ (ไม่ใช่ข้อมูลตัวอย่าง)');
  out.push('-- ' + '='.repeat(72));
  out.push('');
  out.push('-- องค์กร: ถ้าไม่มีแถวนี้ การสมัครสมาชิกจะล้มเหลว');
  out.push('INSERT INTO organizations (name, slug, timezone, locale)');
  out.push(`VALUES (${lit(ORG_NAME)}, ${lit(ORG_SLUG)}, 'Asia/Bangkok', 'th')`);
  out.push('ON CONFLICT (slug) DO UPDATE SET name = excluded.name;');
  out.push('');

  out.push('-- บทบาทผู้ใช้ (roles)');
  for (const code of ALL_ROLES) {
    const meta = ROLES[code];
    out.push(
      `INSERT INTO roles (code, name_th, name_en, rank) VALUES (${lit(code)}, ${lit(meta.nameTh)}, ${lit(meta.nameEn)}, ${meta.rank})`,
    );
    out.push(
      '  ON CONFLICT (code) DO UPDATE SET name_th = excluded.name_th, name_en = excluded.name_en, rank = excluded.rank;',
    );
  }
  out.push('');

  out.push('-- สิทธิ์ทั้งหมดที่ระบบรู้จัก (permissions)');
  for (const [code, meta] of Object.entries(PERMISSIONS)) {
    out.push(
      `INSERT INTO permissions (code, resource, action, description) VALUES (${lit(code)}, ${lit(meta.resource)}, ${lit(meta.action)}, ${lit(meta.description)})`,
    );
    out.push('  ON CONFLICT (code) DO UPDATE SET description = excluded.description;');
  }
  out.push('');

  out.push('-- สิ่งอำนวยความสะดวกมาตรฐาน — ถ้าไม่มี หน้าเพิ่มห้องจะไม่มีรายการให้ติ๊ก');
  out.push(...amenityUpsertSql());
  out.push('');

  out.push('-- จับคู่บทบาทกับสิทธิ์ — ล้างก่อนใส่ใหม่ เพื่อให้ตรงกับโค้ดเสมอ');
  out.push('DELETE FROM role_permissions;');
  for (const [roleCode, perms] of Object.entries(ROLE_PERMISSIONS)) {
    if (perms.length === 0) {
      out.push(`-- ${roleCode}: ไม่มีสิทธิ์ใด ๆ โดยเจตนา (ดูตารางได้เท่านั้น)`);
      continue;
    }
    const values = perms.map((p) => `(${lit(roleCode)}, ${lit(p)})`).join(', ');
    out.push(`INSERT INTO role_permissions (role_code, permission_code) VALUES ${values};`);
  }
  out.push('');

  out.push('COMMIT;');
  out.push('');
  out.push('-- ' + '='.repeat(72));
  out.push('-- ตรวจผล — ต้องขึ้นคำว่า ผ่าน ทุกแถว');
  out.push('-- ' + '='.repeat(72));
  out.push('--');
  out.push('-- รวมเป็นคำสั่งเดียวโดยเจตนา เพราะหน้าเว็บ SQL Editor ส่วนใหญ่');
  out.push('-- แสดงผลของคำสั่งสุดท้ายเท่านั้น ถ้าแยกหลายคำสั่งผู้ใช้จะไม่เห็นผลครบ');
  out.push('--');
  out.push('-- ต้องยกระดับสิทธิ์อีกครั้ง เพราะคำสั่งนี้อยู่นอกธุรกรรมข้างบน');
  out.push('-- ถ้าไม่ตั้ง จะนับได้ 0 ทุกตาราง ซึ่งไม่ใช่ว่าข้อมูลไม่เข้า แต่เป็นเพราะ');
  out.push('-- ระบบกันข้อมูลข้ามผู้ใช้ซ่อนแถวไว้จากคนที่ไม่ได้ล็อกอิน');
  out.push("SELECT set_config('app.user_role', 'service_role', false);");
  out.push('');

  /*
   * ตารางตรวจผลแถวเดียวต่อรายการ: ลำดับ / รายการ / นับได้ / ต้องได้ / ผล
   * ผู้ใช้ที่ไม่เขียนโค้ดดูแค่คอลัมน์ "ผล" ว่าเป็น ผ่าน ทุกแถวหรือไม่
   */
  out.push(...checkSql(files.length));

  process.stdout.write(out.join('\n') + '\n');
}

main();
