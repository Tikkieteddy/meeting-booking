/**
 * เทสต์ Authorization matrix ที่ชั้นฐานข้อมูล (บรีฟข้อ 8, 16, 17 และ AC05)
 * ยืนยันว่า "ซ่อนปุ่ม" ไม่ใช่การป้องกันเดียว — RLS ปฏิเสธจริงแม้เรียกตรงถึงตาราง
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closePool, withServiceTx, withTx } from '@/lib/db/pool';
import { localDateTimeToUtc } from '@/lib/util/time';
import { ctxFor, futureDateISO, resetTransactionalData, seedWorld, type TestWorld } from './fixtures';

let world: TestWorld;
let publicBookingId: string;
let privateBookingId: string;
let busyOnlyBookingId: string;
const dateISO = futureDateISO(7);

beforeAll(async () => {
  world = await seedWorld();
  await resetTransactionalData();

  const ids = await withServiceTx(async (sql) => {
    const make = async (title: string, privacy: string, start: string, end: string, booker: string, attendees: string[]) => {
      const res = await sql.query<{ id: string }>(
        `INSERT INTO bookings (organization_id, room_id, title, starts_at, ends_at, status, privacy,
                               booker_profile_id, booker_name, booker_email, attendee_count,
                               attendee_profile_ids, created_by)
         VALUES ($1,$2,$3,$4,$5,'confirmed',$6,$7,'เจ้าของการจอง','owner@test.local',2,$8::uuid[],$7)
         RETURNING id`,
        [
          world.organizationId,
          world.rooms.simple,
          title,
          localDateTimeToUtc(dateISO, start),
          localDateTimeToUtc(dateISO, end),
          privacy,
          booker,
          attendees,
        ],
      );
      return res.rows[0]!.id;
    };

    return {
      pub: await make('ประชุมเปิดเผย', 'public', '09:00', '10:00', world.users.employee2.id, []),
      priv: await make('ประชุมส่วนตัวของผู้อื่น', 'private', '11:00', '12:00', world.users.employee2.id, []),
      busy: await make('ประชุมแสดงเฉพาะไม่ว่าง', 'busy_only', '13:00', '14:00', world.users.employee2.id, []),
    };
  });
  publicBookingId = ids.pub;
  privateBookingId = ids.priv;
  busyOnlyBookingId = ids.busy;
});

afterAll(async () => {
  await closePool();
});

describe('การมองเห็นการจองของผู้อื่น', () => {
  it('พนักงานเห็นการจองแบบเปิดเผย แต่ไม่เห็นแถวของการจองส่วนตัวของผู้อื่นเลย', async () => {
    const visible = await withTx(ctxFor(world, 'employee'), async (sql) => {
      const res = await sql.query<{ id: string }>('SELECT id FROM bookings ORDER BY starts_at');
      return res.rows.map((r) => r.id);
    });
    expect(visible).toContain(publicBookingId);
    expect(visible).toContain(busyOnlyBookingId);
    expect(visible).not.toContain(privateBookingId);
  });

  it('เจ้าของเห็นการจองส่วนตัวของตัวเอง', async () => {
    const visible = await withTx(ctxFor(world, 'employee2'), async (sql) => {
      const res = await sql.query<{ id: string }>('SELECT id FROM bookings');
      return res.rows.map((r) => r.id);
    });
    expect(visible).toContain(privateBookingId);
  });

  it('view ปิดบังหัวข้อและชื่อผู้จองของการจองแบบ busy_only', async () => {
    const rows = await withTx(ctxFor(world, 'employee'), async (sql) => {
      const res = await sql.query<{ id: string; title: string; booker_name: string | null; can_see_details: boolean }>(
        'SELECT id, title, booker_name, can_see_details FROM app.v_calendar_bookings ORDER BY starts_at',
      );
      return res.rows;
    });
    const busy = rows.find((r) => r.id === busyOnlyBookingId)!;
    expect(busy.can_see_details).toBe(false);
    expect(busy.title).toBe('ไม่ว่าง');
    expect(busy.booker_name).toBeNull();

    const pub = rows.find((r) => r.id === publicBookingId)!;
    expect(pub.can_see_details).toBe(true);
    expect(pub.title).toBe('ประชุมเปิดเผย');
  });

  it('ผู้ดูแลระบบสูงสุดเห็นรายละเอียดทุกการจอง', async () => {
    const rows = await withTx(ctxFor(world, 'admin'), async (sql) => {
      const res = await sql.query<{ id: string; can_see_details: boolean }>(
        'SELECT id, can_see_details FROM app.v_calendar_bookings',
      );
      return res.rows;
    });
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.can_see_details)).toBe(true);
  });

  it('ผู้เข้าร่วมเห็นรายละเอียดของการประชุมส่วนตัวที่ตนถูกเชิญ', async () => {
    await withServiceTx((sql) =>
      sql.query('UPDATE bookings SET attendee_profile_ids = $2::uuid[] WHERE id = $1', [
        privateBookingId,
        [world.users.employee.id],
      ]),
    );
    const rows = await withTx(ctxFor(world, 'employee'), async (sql) => {
      const res = await sql.query<{ id: string; title: string; can_see_details: boolean }>(
        'SELECT id, title, can_see_details FROM app.v_calendar_bookings WHERE id = $1',
        [privateBookingId],
      );
      return res.rows;
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.can_see_details).toBe(true);
    expect(rows[0]?.title).toBe('ประชุมส่วนตัวของผู้อื่น');

    await withServiceTx((sql) =>
      sql.query(`UPDATE bookings SET attendee_profile_ids = '{}'::uuid[] WHERE id = $1`, [privateBookingId]),
    );
  });
});

describe('การแก้ไขข้อมูลของผู้อื่น', () => {
  it('พนักงานแก้การจองของผู้อื่นไม่ได้', async () => {
    const updated = await withTx(ctxFor(world, 'employee'), async (sql) => {
      const res = await sql.query(`UPDATE bookings SET title = 'ถูกแก้โดยคนอื่น' WHERE id = $1`, [publicBookingId]);
      return res.rowCount;
    });
    expect(updated).toBe(0);

    const title = await withServiceTx(async (sql) => {
      const res = await sql.query<{ title: string }>('SELECT title FROM bookings WHERE id = $1', [publicBookingId]);
      return res.rows[0]?.title;
    });
    expect(title).toBe('ประชุมเปิดเผย');
  });

  it('พนักงานยกเลิกการจองของผู้อื่นไม่ได้', async () => {
    const updated = await withTx(ctxFor(world, 'employee'), async (sql) => {
      const res = await sql.query(`UPDATE bookings SET status = 'cancelled' WHERE id = $1`, [publicBookingId]);
      return res.rowCount;
    });
    expect(updated).toBe(0);
  });

  it('เจ้าของแก้การจองของตัวเองได้', async () => {
    const updated = await withTx(ctxFor(world, 'employee2'), async (sql) => {
      const res = await sql.query(`UPDATE bookings SET title = 'แก้ไขโดยเจ้าของ' WHERE id = $1`, [publicBookingId]);
      return res.rowCount;
    });
    expect(updated).toBe(1);
  });

  it('พนักงานลบการจองไม่ได้เลย (ต้องยกเลิกเท่านั้น)', async () => {
    const deleted = await withTx(ctxFor(world, 'employee2'), async (sql) => {
      const res = await sql.query('DELETE FROM bookings WHERE id = $1', [publicBookingId]);
      return res.rowCount;
    });
    expect(deleted).toBe(0);
  });
});

describe('การจัดการห้องและสิทธิ์', () => {
  it('พนักงานเพิ่มห้องใหม่ไม่ได้ (AC05)', async () => {
    await expect(
      withTx(ctxFor(world, 'employee'), (sql) =>
        sql.query(
          `INSERT INTO rooms (organization_id, code, name, capacity, open_days)
           VALUES ($1,'HACK-1','ห้องแอบสร้าง',4,'{1}')`,
          [world.organizationId],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('พนักงานแก้ไขนโยบายห้องไม่ได้', async () => {
    const updated = await withTx(ctxFor(world, 'employee'), async (sql) => {
      const res = await sql.query('UPDATE rooms SET capacity = 999 WHERE id = $1', [world.rooms.simple]);
      return res.rowCount;
    });
    expect(updated).toBe(0);
  });

  it('ผู้ดูแลห้องแก้ไขนโยบายห้องได้', async () => {
    const updated = await withTx(ctxFor(world, 'roomAdmin'), async (sql) => {
      const res = await sql.query('UPDATE rooms SET capacity = 12 WHERE id = $1', [world.rooms.simple]);
      return res.rowCount;
    });
    expect(updated).toBe(1);
    await withServiceTx((sql) => sql.query('UPDATE rooms SET capacity = 10 WHERE id = $1', [world.rooms.simple]));
  });

  it('พนักงานยกสิทธิ์ตัวเองเป็นผู้ดูแลระบบไม่ได้', async () => {
    await expect(
      withTx(ctxFor(world, 'employee'), (sql) =>
        sql.query(`INSERT INTO user_roles (profile_id, role_code, scope_type) VALUES ($1,'super_admin','organization')`, [
          world.users.employee.id,
        ]),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('พนักงานอ่าน audit log ไม่ได้ แต่ผู้ดูแลระบบอ่านได้', async () => {
    await withServiceTx((sql) =>
      sql.query(
        `INSERT INTO audit_logs (actor_profile_id, actor_email, action, resource_type) VALUES ($1,$2,'rls.check','test')`,
        [world.users.admin.id, world.users.admin.email],
      ),
    );

    const asEmployee = await withTx(ctxFor(world, 'employee'), async (sql) => {
      const res = await sql.query<{ count: string }>('SELECT count(*)::text AS count FROM audit_logs');
      return Number(res.rows[0]?.count ?? 0);
    });
    const asAdmin = await withTx(ctxFor(world, 'admin'), async (sql) => {
      const res = await sql.query<{ count: string }>('SELECT count(*)::text AS count FROM audit_logs');
      return Number(res.rows[0]?.count ?? 0);
    });

    expect(asEmployee).toBe(0);
    expect(asAdmin).toBeGreaterThan(0);
  });

  it('พนักงานอ่านคิวงานแจ้งเตือนของระบบไม่ได้', async () => {
    const count = await withTx(ctxFor(world, 'employee'), async (sql) => {
      const res = await sql.query<{ count: string }>('SELECT count(*)::text AS count FROM notification_jobs');
      return Number(res.rows[0]?.count ?? 0);
    });
    expect(count).toBe(0);
  });

  it('พนักงานอ่านข้อมูลรหัสผ่านของใครไม่ได้เลย', async () => {
    const count = await withTx(ctxFor(world, 'employee'), async (sql) => {
      const res = await sql.query<{ count: string }>('SELECT count(*)::text AS count FROM user_credentials');
      return Number(res.rows[0]?.count ?? 0);
    });
    expect(count).toBe(0);
  });

  it('พนักงานอ่านโปรไฟล์ของผู้อื่นไม่ได้ แต่ผู้อนุมัติอ่านได้', async () => {
    const asEmployee = await withTx(ctxFor(world, 'employee'), async (sql) => {
      const res = await sql.query<{ id: string }>('SELECT id FROM profiles');
      return res.rows.map((r) => r.id);
    });
    expect(asEmployee).toEqual([world.users.employee.id]);

    const asApprover = await withTx(ctxFor(world, 'approver'), async (sql) => {
      const res = await sql.query<{ count: string }>('SELECT count(*)::text AS count FROM profiles');
      return Number(res.rows[0]?.count ?? 0);
    });
    expect(asApprover).toBeGreaterThan(1);
  });

  it('ผู้ใช้อ่านการแจ้งเตือนในระบบของคนอื่นไม่ได้', async () => {
    await withServiceTx((sql) =>
      sql.query(
        `INSERT INTO in_app_notifications (profile_id, event_type, title) VALUES ($1,'booking.confirmed','ของคนอื่น')`,
        [world.users.employee2.id],
      ),
    );
    const rows = await withTx(ctxFor(world, 'employee'), async (sql) => {
      const res = await sql.query<{ title: string }>('SELECT title FROM in_app_notifications');
      return res.rows;
    });
    expect(rows).toHaveLength(0);
  });
});

describe('ผู้ใช้ที่ไม่ได้ล็อกอิน', () => {
  it('ไม่เห็นข้อมูลใดเลย', async () => {
    const counts = await withTx({ userId: null, role: 'anonymous' }, async (sql) => {
      const bookings = await sql.query<{ count: string }>('SELECT count(*)::text AS count FROM bookings');
      const rooms = await sql.query<{ count: string }>('SELECT count(*)::text AS count FROM rooms');
      const profiles = await sql.query<{ count: string }>('SELECT count(*)::text AS count FROM profiles');
      return {
        bookings: Number(bookings.rows[0]?.count ?? 0),
        rooms: Number(rooms.rows[0]?.count ?? 0),
        profiles: Number(profiles.rows[0]?.count ?? 0),
      };
    });
    expect(counts).toEqual({ bookings: 0, rooms: 0, profiles: 0 });
  });
});

describe('เปิด/ปิดการใช้งานบทบาท (migration 008)', () => {
  it('พนักงานธรรมดาแก้สถานะบทบาทไม่ได้ — ไม่ error แต่แก้ได้ 0 แถว', async () => {
    const changed = await withTx(ctxFor(world, 'employee'), async (sql) => {
      const res = await sql.query("UPDATE roles SET enabled = false WHERE code = 'approver'");
      return res.rowCount;
    });
    expect(changed).toBe(0);

    // ยืนยันด้วยสิทธิ์ระบบว่าค่ายังเป็น true จริง
    const still = await withServiceTx(async (sql) => {
      const res = await sql.query<{ enabled: boolean }>("SELECT enabled FROM roles WHERE code = 'approver'");
      return res.rows[0]?.enabled;
    });
    expect(still).toBe(true);
  });

  it('ผู้ดูแลระบบสูงสุดปิดบทบาทที่ไม่ใช่บทบาทหลักได้', async () => {
    const changed = await withTx(ctxFor(world, 'admin'), async (sql) => {
      const res = await sql.query("UPDATE roles SET enabled = false WHERE code = 'approver'");
      return res.rowCount;
    });
    expect(changed).toBe(1);

    // คืนค่าเดิมให้เทสต์อื่นในไฟล์นี้ไม่ได้รับผลกระทบ
    await withServiceTx(async (sql) => {
      await sql.query("UPDATE roles SET enabled = true WHERE code = 'approver'");
    });
  });

  it('ปิดบทบาทหลักของระบบไม่ได้ — ฐานข้อมูลปฏิเสธด้วย check constraint', async () => {
    await expect(
      withTx(ctxFor(world, 'admin'), async (sql) => {
        await sql.query("UPDATE roles SET enabled = false WHERE code = 'super_admin'");
      }),
    ).rejects.toThrow();
  });

  it('แก้คอลัมน์อื่นของตารางบทบาทไม่ได้ แม้เป็นผู้ดูแลระบบสูงสุด', async () => {
    await expect(
      withTx(ctxFor(world, 'admin'), async (sql) => {
        await sql.query("UPDATE roles SET name_th = 'ชื่อที่ถูกแก้' WHERE code = 'approver'");
      }),
    ).rejects.toThrow();
  });
});

describe('อาคาร (buildings) — เขียนได้เฉพาะผู้มีสิทธิ์จัดการห้อง', () => {
  it('พนักงานธรรมดาเพิ่มอาคารไม่ได้ — ฐานข้อมูลปฏิเสธ', async () => {
    await expect(
      withTx(ctxFor(world, 'employee'), async (sql) => {
        await sql.query(
          "INSERT INTO buildings (organization_id, name, code) VALUES ($1, 'ตึกลอบใส่', 'HACK')",
          [world.organizationId],
        );
      }),
    ).rejects.toThrow();
  });

  it('ผู้ดูแลห้องเพิ่มอาคารได้ และทุกคนที่ล็อกอินเห็นในรายการ', async () => {
    const id = await withTx(ctxFor(world, 'roomAdmin'), async (sql) => {
      const res = await sql.query<{ id: string }>(
        "INSERT INTO buildings (organization_id, name, code) VALUES ($1, 'อาคารทดสอบ RLS', 'RLS-B1') RETURNING id",
        [world.organizationId],
      );
      return res.rows[0]!.id;
    });
    const seen = await withTx(ctxFor(world, 'employee'), async (sql) => {
      const res = await sql.query('SELECT id FROM buildings WHERE id = $1', [id]);
      return res.rowCount;
    });
    expect(seen).toBe(1);
    await withServiceTx(async (sql) => {
      await sql.query('DELETE FROM buildings WHERE id = $1', [id]);
    });
  });
});
