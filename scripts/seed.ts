/**
 * Seed ข้อมูลตัวอย่าง — บรีฟข้อ 14: "ห้ามใส่ Secret หรือข้อมูลจริงลงใน Seed"
 * ข้อมูลทั้งหมดในไฟล์นี้เป็นข้อมูลสมมติสำหรับทดลองใช้งานเท่านั้น
 * รหัสผ่านตัวอย่างอ่านจาก SEED_PASSWORD (ค่าปริยายใช้ได้เฉพาะเครื่องพัฒนา)
 *
 * รัน: npm run db:seed
 */
import { loadDotEnv } from './load-env';
import { AMENITY_CATALOG } from '../src/lib/domain/amenity-catalog';
loadDotEnv();

import { withServiceTx, closePool } from '../src/lib/db/pool';
import { hashPassword } from '../src/lib/auth/password';
import { ROLES, ROLE_PERMISSIONS, PERMISSIONS, ALL_ROLES } from '../src/lib/rbac/permissions';
import { localDateTimeToUtc, toDateISO, addDaysISO } from '../src/lib/util/time';

const SEED_PASSWORD = process.env.SEED_PASSWORD ?? 'TnnDemo2569!';

// รายการสิ่งอำนวยความสะดวกย้ายไปที่ src/lib/domain/amenity-catalog.ts (แหล่งความจริงเดียว)

const USERS = [
  { email: 'admin@example.com', name: 'สมชาย ผู้ดูแลระบบ', dept: 'เทคโนโลยีสารสนเทศ', role: 'super_admin' as const },
  { email: 'roomadmin@example.com', name: 'มานี ดูแลห้อง', dept: 'บริหารอาคาร', role: 'room_admin' as const },
  { email: 'approver@example.com', name: 'วิชัย หัวหน้าฝ่าย', dept: 'ข่าว', role: 'approver' as const },
  { email: 'user1@example.com', name: 'ปิยะ พนักงานข่าว', dept: 'ข่าว', role: 'employee' as const },
  { email: 'user2@example.com', name: 'อรวรรณ ฝ่ายผลิต', dept: 'ฝ่ายผลิต', role: 'employee' as const },
  { email: 'reception@example.com', name: 'สุดา ประชาสัมพันธ์', dept: 'ประชาสัมพันธ์', role: 'viewer' as const },
];

const ROOMS = [
  {
    code: 'TNN-A-301',
    name: 'ห้องประชุมใหญ่ ชั้น 3',
    floor: '3',
    capacity: 20,
    type: 'board',
    requiresApproval: true,
    amenities: ['tv', 'video_conference', 'microphone', 'whiteboard', 'speaker'],
    description: 'ห้องประชุมใหญ่สำหรับประชุมผู้บริหารและแถลงข่าว',
    bufferBefore: 15,
    bufferAfter: 15,
    checkInRequired: true,
    waitlist: true,
  },
  {
    code: 'TNN-A-201',
    name: 'ห้องประชุมกองบรรณาธิการ',
    floor: '2',
    capacity: 12,
    type: 'meeting',
    requiresApproval: false,
    amenities: ['tv', 'whiteboard', 'video_conference'],
    description: 'ใช้สำหรับประชุมวางแผนข่าวประจำวัน',
    bufferBefore: 0,
    bufferAfter: 10,
    checkInRequired: true,
    waitlist: true,
  },
  {
    code: 'TNN-A-202',
    name: 'ห้องประชุมย่อย 2',
    floor: '2',
    capacity: 6,
    type: 'huddle',
    requiresApproval: false,
    amenities: ['tv', 'whiteboard'],
    description: 'ห้องเล็กสำหรับคุยงานทีมย่อย',
    bufferBefore: 0,
    bufferAfter: 0,
    checkInRequired: false,
    waitlist: false,
  },
  {
    code: 'TNN-B-101',
    name: 'ห้องฝึกอบรม อาคาร B',
    floor: '1',
    capacity: 30,
    type: 'training',
    requiresApproval: true,
    amenities: ['projector', 'microphone', 'speaker', 'accessible'],
    description: 'ห้องอบรมพร้อมโปรเจกเตอร์และระบบเสียง',
    bufferBefore: 30,
    bufferAfter: 30,
    checkInRequired: false,
    waitlist: false,
  },
  {
    code: 'TNN-B-102',
    name: 'ห้องสตูดิโอย่อย',
    floor: '1',
    capacity: 8,
    type: 'studio',
    requiresApproval: false,
    amenities: ['microphone', 'speaker', 'video_conference'],
    description: 'ห้องอัดเสียงและสัมภาษณ์ออนไลน์',
    bufferBefore: 15,
    bufferAfter: 15,
    checkInRequired: true,
    waitlist: false,
  },
];

async function main() {
  console.log('เริ่ม seed ข้อมูลตัวอย่าง...');
  const passwordHash = await hashPassword(SEED_PASSWORD);

  await withServiceTx(async (sql) => {
    // ---------- องค์กร ----------
    const org = await sql.query<{ id: string }>(
      `INSERT INTO organizations (name, slug, timezone, locale)
       VALUES ('บริษัท ทีเอ็นเอ็น (ตัวอย่าง) จำกัด', 'tnn', 'Asia/Bangkok', 'th')
       ON CONFLICT (slug) DO UPDATE SET name = excluded.name
       RETURNING id`,
    );
    const orgId = org.rows[0]!.id;

    // ---------- roles / permissions ----------
    for (const code of ALL_ROLES) {
      const meta = ROLES[code];
      await sql.query(
        `INSERT INTO roles (code, name_th, name_en, rank) VALUES ($1,$2,$3,$4)
         ON CONFLICT (code) DO UPDATE SET name_th = excluded.name_th, name_en = excluded.name_en, rank = excluded.rank`,
        [code, meta.nameTh, meta.nameEn, meta.rank],
      );
    }
    for (const [code, meta] of Object.entries(PERMISSIONS)) {
      await sql.query(
        `INSERT INTO permissions (code, resource, action, description) VALUES ($1,$2,$3,$4)
         ON CONFLICT (code) DO UPDATE SET description = excluded.description`,
        [code, meta.resource, meta.action, meta.description],
      );
    }
    await sql.query('DELETE FROM role_permissions');
    for (const [roleCode, perms] of Object.entries(ROLE_PERMISSIONS)) {
      for (const p of perms) {
        await sql.query('INSERT INTO role_permissions (role_code, permission_code) VALUES ($1,$2)', [roleCode, p]);
      }
    }

    // ---------- อุปกรณ์ ----------
    for (const a of AMENITY_CATALOG) {
      await sql.query(
        `INSERT INTO amenities (code, name_th, name_en, icon, sort_order) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (code) DO UPDATE SET name_th = excluded.name_th, name_en = excluded.name_en`,
        [a.code, a.nameTh, a.nameEn, a.icon, a.sortOrder],
      );
    }

    // ---------- อาคาร ----------
    const buildingIds: Record<string, string> = {};
    for (const b of [
      { code: 'A', name: 'อาคาร A (สำนักงานใหญ่)', order: 10 },
      { code: 'B', name: 'อาคาร B (ศูนย์ฝึกอบรม)', order: 20 },
    ]) {
      const res = await sql.query<{ id: string }>(
        `INSERT INTO buildings (organization_id, name, code, sort_order) VALUES ($1,$2,$3,$4)
         ON CONFLICT (organization_id, lower(code)) DO UPDATE SET name = excluded.name
         RETURNING id`,
        [orgId, b.name, b.code, b.order],
      );
      buildingIds[b.code] = res.rows[0]!.id;
    }

    // ---------- ผู้ใช้ ----------
    const userIds: Record<string, string> = {};
    for (const u of USERS) {
      const res = await sql.query<{ id: string }>(
        `INSERT INTO profiles (organization_id, email, full_name, department, status, email_verified_at)
         VALUES ($1,$2,$3,$4,'active', now())
         ON CONFLICT (organization_id, lower(email))
         DO UPDATE SET full_name = excluded.full_name, department = excluded.department
         RETURNING id`,
        [orgId, u.email, u.name, u.dept],
      );
      const id = res.rows[0]!.id;
      userIds[u.email] = id;
      await sql.query(
        `INSERT INTO user_credentials (profile_id, password_hash) VALUES ($1,$2)
         ON CONFLICT (profile_id) DO UPDATE SET password_hash = excluded.password_hash`,
        [id, passwordHash],
      );
      await sql.query(
        `INSERT INTO user_roles (profile_id, role_code, scope_type) VALUES ($1,$2,'organization')
         ON CONFLICT (profile_id, role_code, scope_type, coalesce(scope_id, '')) DO NOTHING`,
        [id, u.role],
      );
      await sql.query(
        `INSERT INTO notification_preferences (profile_id) VALUES ($1) ON CONFLICT (profile_id) DO NOTHING`,
        [id],
      );
    }

    // ---------- ห้องประชุม ----------
    const roomIds: Record<string, string> = {};
    for (const [index, r] of ROOMS.entries()) {
      const buildingCode = r.code.split('-')[1] ?? 'A';
      const res = await sql.query<{ id: string }>(
        `INSERT INTO rooms (organization_id, building_id, code, name, description, floor, capacity, room_type,
                            requires_approval, buffer_before_minutes, buffer_after_minutes,
                            check_in_required, waitlist_enabled, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         ON CONFLICT (organization_id, lower(code)) DO UPDATE SET
           name = excluded.name, description = excluded.description, capacity = excluded.capacity,
           requires_approval = excluded.requires_approval
         RETURNING id`,
        [
          orgId,
          buildingIds[buildingCode] ?? null,
          r.code,
          r.name,
          r.description,
          r.floor,
          r.capacity,
          r.type,
          r.requiresApproval,
          r.bufferBefore,
          r.bufferAfter,
          r.checkInRequired,
          r.waitlist,
          (index + 1) * 10,
        ],
      );
      const roomId = res.rows[0]!.id;
      roomIds[r.code] = roomId;
      await sql.query('DELETE FROM room_amenities WHERE room_id = $1', [roomId]);
      for (const code of r.amenities) {
        await sql.query('INSERT INTO room_amenities (room_id, amenity_code) VALUES ($1,$2)', [roomId, code]);
      }
      if (r.requiresApproval) {
        await sql.query(
          `INSERT INTO room_approvers (room_id, profile_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
          [roomId, userIds['approver@example.com']],
        );
      }
    }

    // ---------- วันหยุดตัวอย่าง ----------
    const year = new Date().getFullYear();
    for (const h of [
      { date: `${year}-12-05`, name: 'วันคล้ายวันพระบรมราชสมภพ ร.9 (ตัวอย่าง)' },
      { date: `${year}-12-31`, name: 'วันสิ้นปี (ตัวอย่าง)' },
    ]) {
      await sql.query(
        `INSERT INTO holidays (organization_id, holiday_date, name)
         VALUES ($1,$2,$3)
         ON CONFLICT (organization_id, holiday_date, coalesce(room_id::text, 'org')) DO NOTHING`,
        [orgId, h.date, h.name],
      );
    }

    // ---------- การจองตัวอย่าง ----------
    const today = toDateISO(new Date());
    const samples = [
      {
        room: 'TNN-A-201',
        booker: 'user1@example.com',
        date: today,
        start: '09:00',
        end: '10:30',
        title: 'ประชุมวางแผนข่าวเช้า',
        status: 'confirmed',
        privacy: 'public',
        attendees: 8,
      },
      {
        room: 'TNN-A-201',
        booker: 'user2@example.com',
        date: today,
        start: '13:00',
        end: '14:00',
        title: 'รีวิวสคริปต์รายการพิเศษ',
        status: 'confirmed',
        privacy: 'public',
        attendees: 5,
      },
      {
        room: 'TNN-A-301',
        booker: 'user2@example.com',
        date: addDaysISO(today, 1),
        start: '10:00',
        end: '12:00',
        title: 'ประชุมผู้บริหารประจำเดือน',
        status: 'pending',
        privacy: 'busy_only',
        attendees: 15,
      },
      {
        room: 'TNN-A-202',
        booker: 'user1@example.com',
        date: addDaysISO(today, 1),
        start: '15:00',
        end: '16:00',
        title: 'คุยงานทีมกราฟิก',
        status: 'confirmed',
        privacy: 'public',
        attendees: 4,
      },
      {
        room: 'TNN-B-101',
        booker: 'roomadmin@example.com',
        date: addDaysISO(today, 3),
        start: '09:00',
        end: '16:00',
        title: 'อบรมความปลอดภัยข้อมูลส่วนบุคคล',
        status: 'confirmed',
        privacy: 'public',
        attendees: 25,
      },
    ];

    for (const s of samples) {
      const roomId = roomIds[s.room]!;
      const bookerId = userIds[s.booker]!;
      const bookerInfo = USERS.find((u) => u.email === s.booker)!;
      const roomInfo = ROOMS.find((r) => r.code === s.room)!;
      const startsAt = localDateTimeToUtc(s.date, s.start);
      const endsAt = localDateTimeToUtc(s.date, s.end);
      const inserted = await sql.query<{ id: string }>(
        `INSERT INTO bookings (organization_id, room_id, title, starts_at, ends_at,
                               buffer_before_minutes, buffer_after_minutes, status, privacy,
                               booker_profile_id, booker_name, booker_email, booker_department,
                               attendee_count, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$10)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [
          orgId,
          roomId,
          s.title,
          startsAt,
          endsAt,
          roomInfo.bufferBefore,
          roomInfo.bufferAfter,
          s.status,
          s.privacy,
          bookerId,
          bookerInfo.name,
          s.booker,
          bookerInfo.dept,
          s.attendees,
        ],
      );
      const bookingId = inserted.rows[0]?.id;
      if (bookingId && s.status === 'pending') {
        await sql.query(
          `INSERT INTO approvals (booking_id, approver_id, status) VALUES ($1,$2,'pending')`,
          [bookingId, userIds['approver@example.com']],
        );
      }
    }

    // ---------- ค่าตั้งค่าองค์กร ----------
    await sql.query(
      `INSERT INTO app_settings (organization_id, key, value, description)
       VALUES ($1, 'calendar.default_view', '"day"'::jsonb, 'มุมมองปฏิทินเริ่มต้น')
       ON CONFLICT (organization_id, key) DO NOTHING`,
      [orgId],
    );
  });

  console.log('✔ seed สำเร็จ');
  console.log('');
  console.log('บัญชีตัวอย่างสำหรับทดลองใช้งาน (ข้อมูลสมมติทั้งหมด):');
  for (const u of USERS) console.log(`  ${u.email.padEnd(26)} ${u.role.padEnd(12)} ${u.name}`);
  console.log(`  รหัสผ่านทุกบัญชี: ${SEED_PASSWORD}`);
  console.log('  ★ เปลี่ยนรหัสผ่านทันทีหลังใช้งานจริง และห้ามใช้บัญชีชุดนี้บน production');
  await closePool();
}

main().catch(async (error) => {
  console.error(error);
  await closePool();
  process.exit(1);
});
