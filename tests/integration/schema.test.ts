/**
 * เทสต์โครงสร้างฐานข้อมูล: กันจองซ้อนที่ชั้น DB, buffer, และความไม่สามารถแก้ audit log
 * (บรีฟข้อ 6, 11 และ 17)
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closePool, withServiceTx, withTx } from '@/lib/db/pool';
import { PG_ERROR, pgErrorCode } from '@/lib/domain/errors';
import { localDateTimeToUtc } from '@/lib/util/time';
import { resetTransactionalData, seedWorld, futureDateISO, type TestWorld } from './fixtures';

let world: TestWorld;
const dateISO = futureDateISO(5);

async function insertBooking(opts: {
  roomId: string;
  bookerId: string;
  start: string;
  end: string;
  status?: string;
  bufferBefore?: number;
  bufferAfter?: number;
}) {
  return withServiceTx(async (sql) => {
    const res = await sql.query<{ id: string; blocked_period: string }>(
      `INSERT INTO bookings (organization_id, room_id, title, starts_at, ends_at,
                             buffer_before_minutes, buffer_after_minutes, status, privacy,
                             booker_profile_id, booker_name, booker_email, attendee_count, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'public',$9,'ผู้ทดสอบ','test@test.local',2,$9)
       RETURNING id, blocked_period::text`,
      [
        world.organizationId,
        opts.roomId,
        `ทดสอบ ${opts.start}`,
        localDateTimeToUtc(dateISO, opts.start),
        localDateTimeToUtc(dateISO, opts.end),
        opts.bufferBefore ?? 0,
        opts.bufferAfter ?? 0,
        opts.status ?? 'confirmed',
        opts.bookerId,
      ],
    );
    return res.rows[0]!;
  });
}

beforeAll(async () => {
  world = await seedWorld();
  await resetTransactionalData();
});

afterAll(async () => {
  await closePool();
});

describe('migration และ constraint', () => {
  it('รัน migration ครบทุกไฟล์ที่มีในโปรเจกต์ และทุกไฟล์มีไฟล์ย้อนกลับ', async () => {
    const files = readdirSync(join(process.cwd(), 'db', 'migrations'));
    const expected = files
      .filter((f) => f.endsWith('.up.sql'))
      .map((f) => f.split('_')[0]!)
      .sort();

    const applied = await withServiceTx(async (sql) => {
      const res = await sql.query<{ version: string }>('SELECT version FROM schema_migrations ORDER BY version');
      return res.rows.map((r) => r.version);
    });

    expect(applied).toEqual(expected);
    // บรีฟข้อ 14: migration ต้องย้อนกลับได้
    for (const file of files.filter((f) => f.endsWith('.up.sql'))) {
      expect(files).toContain(file.replace('.up.sql', '.down.sql'));
    }
  });

  it('เปิด RLS และ FORCE บนตารางข้อมูลสำคัญ', async () => {
    const rows = await withServiceTx(async (sql) => {
      const res = await sql.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(
        `SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class
          WHERE relname IN ('bookings','profiles','audit_logs','rooms','notification_jobs')`,
      );
      return res.rows;
    });
    expect(rows).toHaveLength(5);
    for (const row of rows) {
      expect(row.relrowsecurity, `${row.relname} ต้องเปิด RLS`).toBe(true);
      expect(row.relforcerowsecurity, `${row.relname} ต้อง FORCE RLS`).toBe(true);
    }
  });

  it('trigger คำนวณ blocked_period จากเวลาจริงบวก buffer', async () => {
    const booking = await insertBooking({
      roomId: world.rooms.buffered,
      bookerId: world.users.employee.id,
      start: '10:00',
      end: '11:00',
      bufferBefore: 15,
      bufferAfter: 30,
    });
    // 09:45 ถึง 11:30 ตามเวลาไทย = 02:45Z ถึง 04:30Z
    expect(booking.blocked_period).toContain('02:45:00');
    expect(booking.blocked_period).toContain('04:30:00');
  });

  it('ห้ามจองซ้อนห้องเดียวกันด้วย exclusion constraint', async () => {
    await insertBooking({ roomId: world.rooms.simple, bookerId: world.users.employee.id, start: '13:00', end: '14:00' });
    await expect(
      insertBooking({ roomId: world.rooms.simple, bookerId: world.users.employee2.id, start: '13:30', end: '14:30' }),
    ).rejects.toSatisfy((error: unknown) => pgErrorCode(error) === PG_ERROR.exclusionViolation);
  });

  it('จองต่อเนื่องแบบชนขอบพอดีได้ (ช่วงเป็นแบบ half-open)', async () => {
    await insertBooking({ roomId: world.rooms.simple, bookerId: world.users.employee.id, start: '15:00', end: '16:00' });
    await expect(
      insertBooking({ roomId: world.rooms.simple, bookerId: world.users.employee2.id, start: '16:00', end: '17:00' }),
    ).resolves.toBeDefined();
  });

  it('buffer ทำให้ช่วงที่ดูเหมือนว่างยังชนกัน', async () => {
    await insertBooking({
      roomId: world.rooms.buffered,
      bookerId: world.users.employee.id,
      start: '14:00',
      end: '15:00',
      bufferBefore: 15,
      bufferAfter: 15,
    });
    // 15:00-16:00 ดูเหมือนว่าง แต่ buffer 15 นาทีหลังประชุมกินถึง 15:15
    await expect(
      insertBooking({
        roomId: world.rooms.buffered,
        bookerId: world.users.employee2.id,
        start: '15:00',
        end: '16:00',
        bufferBefore: 15,
        bufferAfter: 15,
      }),
    ).rejects.toSatisfy((error: unknown) => pgErrorCode(error) === PG_ERROR.exclusionViolation);
  });

  it('การจองที่ถูกยกเลิกไม่กันเวลาอีกต่อไป', async () => {
    const booking = await insertBooking({
      roomId: world.rooms.simple,
      bookerId: world.users.employee.id,
      start: '17:00',
      end: '18:00',
    });
    await withServiceTx((sql) => sql.query(`UPDATE bookings SET status = 'cancelled' WHERE id = $1`, [booking.id]));
    await expect(
      insertBooking({ roomId: world.rooms.simple, bookerId: world.users.employee2.id, start: '17:00', end: '18:00' }),
    ).resolves.toBeDefined();
  });

  it('ห้องต่างกันจองเวลาเดียวกันได้', async () => {
    await expect(
      insertBooking({ roomId: world.rooms.approval, bookerId: world.users.employee.id, start: '13:00', end: '14:00', status: 'pending' }),
    ).resolves.toBeDefined();
  });

  it('ห้ามจองที่เวลาสิ้นสุดก่อนเวลาเริ่ม', async () => {
    // ฐานข้อมูลปฏิเสธที่ trigger สร้าง tstzrange ก่อน (รหัส 22000) ซึ่งเกิดก่อน
    // check constraint bookings_time_order จะทำงาน — ทั้งสองทางคือการปฏิเสธที่ชั้น DB
    await expect(
      insertBooking({ roomId: world.rooms.simple, bookerId: world.users.employee.id, start: '11:00', end: '10:00' }),
    ).rejects.toSatisfy(
      (error: unknown) => pgErrorCode(error) === '22000' || pgErrorCode(error) === PG_ERROR.checkViolation,
    );
  });

  it('ห้ามลบห้องที่มีประวัติการจอง (foreign key RESTRICT)', async () => {
    await expect(
      withServiceTx((sql) => sql.query('DELETE FROM rooms WHERE id = $1', [world.rooms.simple])),
    ).rejects.toSatisfy((error: unknown) => pgErrorCode(error) === PG_ERROR.foreignKeyViolation);
  });
});

describe('audit log แก้ไขย้อนหลังไม่ได้', () => {
  it('เขียนได้ด้วยสิทธิ์ระบบ แต่ UPDATE และ DELETE ไม่มีผลแม้เป็นผู้ดูแลระบบสูงสุด', async () => {
    await withServiceTx((sql) =>
      sql.query(
        `INSERT INTO audit_logs (actor_profile_id, actor_email, action, resource_type, resource_id)
         VALUES ($1,$2,'test.action','test','res-1')`,
        [world.users.admin.id, world.users.admin.email],
      ),
    );

    const adminCtx = { userId: world.users.admin.id, role: 'authenticated' as const };
    const updated = await withTx(adminCtx, async (sql) => {
      const res = await sql.query(`UPDATE audit_logs SET action = 'tampered' WHERE action = 'test.action'`);
      return res.rowCount;
    });
    const deleted = await withTx(adminCtx, async (sql) => {
      const res = await sql.query(`DELETE FROM audit_logs WHERE action = 'test.action'`);
      return res.rowCount;
    });

    expect(updated).toBe(0);
    expect(deleted).toBe(0);

    const still = await withServiceTx(async (sql) => {
      const res = await sql.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM audit_logs WHERE action = 'test.action'`,
      );
      return Number(res.rows[0]?.count ?? 0);
    });
    expect(still).toBe(1);
  });
});
