/**
 * ข้อมูลตั้งต้นสำหรับเทสต์ Integration
 * สร้างองค์กร สิทธิ์ ผู้ใช้ และห้องขั้นต่ำที่ใช้ทดสอบ โดยไม่พึ่งไฟล์ seed จริง
 */
import { withServiceTx, type Sql } from '@/lib/db/pool';
import { ALL_ROLES, PERMISSIONS, ROLES, ROLE_PERMISSIONS, type RoleCode } from '@/lib/rbac/permissions';
import type { Actor } from '@/lib/domain/booking-service';

export type TestUser = { id: string; email: string; fullName: string; roleCode: RoleCode };

export type TestWorld = {
  organizationId: string;
  users: Record<'admin' | 'roomAdmin' | 'approver' | 'employee' | 'employee2' | 'viewer', TestUser>;
  rooms: { simple: string; approval: string; buffered: string };
};

const TEST_AMENITIES = [
  { code: 'tv', th: 'ทีวี', en: 'TV' },
  { code: 'projector', th: 'โปรเจกเตอร์', en: 'Projector' },
  { code: 'whiteboard', th: 'ไวท์บอร์ด', en: 'Whiteboard' },
  { code: 'video_conference', th: 'ประชุมทางไกล', en: 'Video conference' },
];

async function ensureRbac(sql: Sql) {
  for (const code of ALL_ROLES) {
    await sql.query(
      `INSERT INTO roles (code, name_th, name_en, rank) VALUES ($1,$2,$3,$4) ON CONFLICT (code) DO NOTHING`,
      [code, ROLES[code].nameTh, ROLES[code].nameEn, ROLES[code].rank],
    );
  }
  for (const [code, meta] of Object.entries(PERMISSIONS)) {
    await sql.query(
      `INSERT INTO permissions (code, resource, action, description) VALUES ($1,$2,$3,$4) ON CONFLICT (code) DO NOTHING`,
      [code, meta.resource, meta.action, meta.description],
    );
  }
  for (const amenity of TEST_AMENITIES) {
    await sql.query(
      `INSERT INTO amenities (code, name_th, name_en) VALUES ($1,$2,$3) ON CONFLICT (code) DO NOTHING`,
      [amenity.code, amenity.th, amenity.en],
    );
  }
  await sql.query('DELETE FROM role_permissions');
  for (const [roleCode, perms] of Object.entries(ROLE_PERMISSIONS)) {
    for (const permission of perms) {
      await sql.query('INSERT INTO role_permissions (role_code, permission_code) VALUES ($1,$2)', [roleCode, permission]);
    }
  }
}

/** ล้างข้อมูลธุรกรรมทั้งหมด แต่คงโครงสร้างและ RBAC ไว้ */
export async function resetTransactionalData(): Promise<void> {
  await withServiceTx(async (sql) => {
    await sql.query(`TRUNCATE
      notification_deliveries, notification_jobs, in_app_notifications, email_suppressions,
      audit_logs, approvals, booking_attendees, booking_resources, waitlist_entries,
      bookings, booking_series, room_closures, holidays, rate_limit_counters, login_attempts
      RESTART IDENTITY CASCADE`);
  });
}

export async function seedWorld(): Promise<TestWorld> {
  return withServiceTx(async (sql) => {
    await ensureRbac(sql);

    const org = await sql.query<{ id: string }>(
      `INSERT INTO organizations (name, slug) VALUES ('องค์กรทดสอบ', 'test-org')
       ON CONFLICT (slug) DO UPDATE SET name = excluded.name RETURNING id`,
    );
    const organizationId = org.rows[0]!.id;

    const definitions: { key: keyof TestWorld['users']; email: string; fullName: string; roleCode: RoleCode }[] = [
      { key: 'admin', email: 'admin@test.local', fullName: 'ผู้ดูแลระบบสูงสุด', roleCode: 'super_admin' },
      { key: 'roomAdmin', email: 'roomadmin@test.local', fullName: 'ผู้ดูแลห้อง', roleCode: 'room_admin' },
      { key: 'approver', email: 'approver@test.local', fullName: 'ผู้อนุมัติ', roleCode: 'approver' },
      { key: 'employee', email: 'employee@test.local', fullName: 'พนักงานคนที่หนึ่ง', roleCode: 'employee' },
      { key: 'employee2', email: 'employee2@test.local', fullName: 'พนักงานคนที่สอง', roleCode: 'employee' },
      { key: 'viewer', email: 'viewer@test.local', fullName: 'ผู้ชม', roleCode: 'viewer' },
    ];

    const users = {} as TestWorld['users'];
    for (const def of definitions) {
      const res = await sql.query<{ id: string }>(
        `INSERT INTO profiles (organization_id, email, full_name, department, status, email_verified_at)
         VALUES ($1,$2,$3,'ฝ่ายทดสอบ','active', now())
         ON CONFLICT (organization_id, lower(email)) DO UPDATE SET full_name = excluded.full_name
         RETURNING id`,
        [organizationId, def.email, def.fullName],
      );
      const id = res.rows[0]!.id;
      await sql.query('DELETE FROM user_roles WHERE profile_id = $1', [id]);
      await sql.query(`INSERT INTO user_roles (profile_id, role_code, scope_type) VALUES ($1,$2,'organization')`, [
        id,
        def.roleCode,
      ]);
      await sql.query('INSERT INTO notification_preferences (profile_id) VALUES ($1) ON CONFLICT DO NOTHING', [id]);
      users[def.key] = { id, email: def.email, fullName: def.fullName, roleCode: def.roleCode };
    }

    const roomDefs = [
      { code: 'TEST-SIMPLE', name: 'ห้องทดสอบยืนยันอัตโนมัติ', approval: false, before: 0, after: 0, waitlist: true, checkIn: true },
      { code: 'TEST-APPROVAL', name: 'ห้องทดสอบต้องอนุมัติ', approval: true, before: 0, after: 0, waitlist: false, checkIn: false },
      { code: 'TEST-BUFFER', name: 'ห้องทดสอบมี buffer', approval: false, before: 15, after: 15, waitlist: false, checkIn: false },
    ];
    const roomIds: Record<string, string> = {};
    for (const def of roomDefs) {
      const res = await sql.query<{ id: string }>(
        `INSERT INTO rooms (organization_id, code, name, capacity, open_time, close_time, open_days,
                            slot_step_minutes, min_duration_minutes, max_duration_minutes,
                            buffer_before_minutes, buffer_after_minutes, requires_approval,
                            check_in_required, check_in_grace_minutes, waitlist_enabled)
         VALUES ($1,$2,$3,10,'08:00','20:00','{0,1,2,3,4,5,6}',30,30,240,$4,$5,$6,$7,15,$8)
         ON CONFLICT (organization_id, lower(code)) DO UPDATE SET name = excluded.name
         RETURNING id`,
        [organizationId, def.code, def.name, def.before, def.after, def.approval, def.checkIn, def.waitlist],
      );
      roomIds[def.code] = res.rows[0]!.id;
    }

    await sql.query(
      `INSERT INTO room_approvers (room_id, profile_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [roomIds['TEST-APPROVAL'], users.approver.id],
    );

    return {
      organizationId,
      users,
      rooms: {
        simple: roomIds['TEST-SIMPLE']!,
        approval: roomIds['TEST-APPROVAL']!,
        buffered: roomIds['TEST-BUFFER']!,
      },
    };
  });
}

export function actorFor(world: TestWorld, key: keyof TestWorld['users']): Actor {
  const user = world.users[key];
  const permissions = [...(ROLE_PERMISSIONS[user.roleCode] ?? [])];
  return {
    profileId: user.id,
    organizationId: world.organizationId,
    email: user.email,
    fullName: user.fullName,
    department: 'ฝ่ายทดสอบ',
    permissions,
    ipHint: '203.0.113.0/24',
    userAgent: 'vitest',
    correlationId: `test-${Math.random().toString(36).slice(2, 10)}`,
  };
}

export function ctxFor(world: TestWorld, key: keyof TestWorld['users']) {
  return { userId: world.users[key].id, role: 'authenticated' as const };
}

/** วันที่ในอนาคตที่ปลอดภัยสำหรับการจอง (รูปแบบ YYYY-MM-DD ตามเวลาไทย) */
export function futureDateISO(offsetDays = 3): string {
  const date = new Date(Date.now() + offsetDays * 24 * 3600_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(date);
}
