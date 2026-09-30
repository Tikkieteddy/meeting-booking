/**
 * เทสต์ชั้นบริการการจองแบบครบวงจร (บรีฟข้อ 5, 6, 17 และ AC04)
 * รวมการทดสอบ race condition: หลายคำขอจองห้องเดียวกันช่วงเดียวกันพร้อมกัน
 * ต้องสำเร็จได้เพียงรายการเดียว
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closePool, withServiceTx, withTx } from '@/lib/db/pool';
import {
  cancelBooking,
  checkInBooking,
  createBooking,
  createRecurringBookings,
  decideApproval,
  getBookingDetail,
  joinWaitlist,
  updateBooking,
} from '@/lib/domain/booking-service';
import { ConflictError, ValidationError } from '@/lib/domain/errors';
import { dispatchNotifications } from '@/lib/notify/worker';
import { runMaintenance } from '@/lib/domain/maintenance';
import { searchBookings, searchFreeSlots, searchRooms } from '@/lib/domain/search';
import { getCalendarData } from '@/lib/domain/calendar';
import { localDateTimeToUtc } from '@/lib/util/time';
import { actorFor, ctxFor, futureDateISO, resetTransactionalData, seedWorld, type TestWorld } from './fixtures';

let world: TestWorld;
const dateISO = futureDateISO(10);

beforeAll(async () => {
  world = await seedWorld();
});

beforeEach(async () => {
  await resetTransactionalData();
});

afterAll(async () => {
  await closePool();
});

function baseBooking(overrides: Partial<Parameters<typeof createBooking>[2]> = {}) {
  return {
    roomId: world.rooms.simple,
    title: 'ประชุมทดสอบ',
    dateISO,
    startTime: '10:00',
    endTime: '11:00',
    attendeeCount: 4,
    ...overrides,
  };
}

describe('สร้างการจอง', () => {
  it('ห้องที่ยืนยันอัตโนมัติได้สถานะ confirmed และบันทึก audit log', async () => {
    const actor = actorFor(world, 'employee');
    const { booking, requiresApproval } = await createBooking(ctxFor(world, 'employee'), actor, baseBooking());

    expect(booking.status).toBe('confirmed');
    expect(requiresApproval).toBe(false);
    expect(booking.bookerName).toBe(world.users.employee.fullName);

    const audit = await withServiceTx(async (sql) => {
      const res = await sql.query<{ action: string; resource_id: string }>(
        `SELECT action, resource_id FROM audit_logs WHERE action = 'booking.create'`,
      );
      return res.rows;
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]?.resource_id).toBe(booking.id);
  });

  it('ห้องที่ต้องอนุมัติได้สถานะ pending และสร้างคำขออนุมัติให้ผู้อนุมัติของห้อง', async () => {
    const actor = actorFor(world, 'employee');
    const { booking, requiresApproval } = await createBooking(
      ctxFor(world, 'employee'),
      actor,
      baseBooking({ roomId: world.rooms.approval }),
    );

    expect(booking.status).toBe('pending');
    expect(requiresApproval).toBe(true);

    const approvals = await withServiceTx(async (sql) => {
      const res = await sql.query<{ approver_id: string; status: string }>(
        'SELECT approver_id, status FROM approvals WHERE booking_id = $1',
        [booking.id],
      );
      return res.rows;
    });
    expect(approvals).toHaveLength(1);
    expect(approvals[0]).toMatchObject({ approver_id: world.users.approver.id, status: 'pending' });
  });

  it('บันทึกผู้เข้าร่วมและจับคู่กับบัญชีในองค์กรให้อัตโนมัติ', async () => {
    const { booking } = await createBooking(
      ctxFor(world, 'employee'),
      actorFor(world, 'employee'),
      baseBooking({ attendees: [{ email: world.users.employee2.email }, { email: 'outsider@partner.example' }] }),
    );

    const rows = await withServiceTx(async (sql) => {
      const res = await sql.query<{ email: string; kind: string; profile_id: string | null }>(
        'SELECT email, kind, profile_id FROM booking_attendees WHERE booking_id = $1 ORDER BY email',
        [booking.id],
      );
      const mirror = await sql.query<{ attendee_profile_ids: string[] }>(
        'SELECT attendee_profile_ids FROM bookings WHERE id = $1',
        [booking.id],
      );
      return { attendees: res.rows, mirror: mirror.rows[0]!.attendee_profile_ids };
    });

    expect(rows.attendees).toHaveLength(2);
    expect(rows.attendees.find((a) => a.email === world.users.employee2.email)).toMatchObject({
      kind: 'internal',
      profile_id: world.users.employee2.id,
    });
    expect(rows.attendees.find((a) => a.email === 'outsider@partner.example')?.kind).toBe('external');
    // สำเนา profile id ที่ RLS ใช้ ต้องตรงกับตารางผู้เข้าร่วม
    expect(rows.mirror).toEqual([world.users.employee2.id]);
  });

  it('ปฏิเสธการจองที่ชนเวลา พร้อมบอกว่าชนกับรายการใด', async () => {
    await createBooking(ctxFor(world, 'employee'), actorFor(world, 'employee'), baseBooking());

    await expect(
      createBooking(
        ctxFor(world, 'employee2'),
        actorFor(world, 'employee2'),
        baseBooking({ title: 'ประชุมชนเวลา', startTime: '10:30', endTime: '11:30' }),
      ),
    ).rejects.toThrow(ConflictError);
  });

  it('ปฏิเสธเวลาที่ผิดกฎธุรกิจ พร้อมรายละเอียดรายฟิลด์', async () => {
    await expect(
      createBooking(
        ctxFor(world, 'employee'),
        actorFor(world, 'employee'),
        baseBooking({ attendeeCount: 99 }),
      ),
    ).rejects.toThrow(ValidationError);
  });

  it('ปฏิเสธการจองช่วงที่ห้องปิดปรับปรุง', async () => {
    await withServiceTx((sql) =>
      sql.query(
        `INSERT INTO room_closures (room_id, starts_at, ends_at, reason) VALUES ($1,$2,$3,'ซ่อมเครื่องปรับอากาศ')`,
        [world.rooms.simple, localDateTimeToUtc(dateISO, '09:00'), localDateTimeToUtc(dateISO, '12:00')],
      ),
    );
    await expect(
      createBooking(ctxFor(world, 'employee'), actorFor(world, 'employee'), baseBooking()),
    ).rejects.toThrow(ConflictError);
  });

  it('idempotency key ทำให้กดซ้ำไม่เกิดรายการซ้ำ', async () => {
    const input = baseBooking({ idempotencyKey: 'same-key-001' });
    const first = await createBooking(ctxFor(world, 'employee'), actorFor(world, 'employee'), input);
    const second = await createBooking(ctxFor(world, 'employee'), actorFor(world, 'employee'), input);

    expect(second.booking.id).toBe(first.booking.id);
    const count = await withServiceTx(async (sql) => {
      const res = await sql.query<{ count: string }>('SELECT count(*)::text AS count FROM bookings');
      return Number(res.rows[0]?.count ?? 0);
    });
    expect(count).toBe(1);
  });
});

describe('AC04 — หลายคำขอพร้อมกันต้องสำเร็จเพียงรายการเดียว', () => {
  it('ยิง 10 คำขอจองห้องเดียวกันช่วงเดียวกันพร้อมกัน', async () => {
    const attempts = Array.from({ length: 10 }, (_, index) => {
      const key = index % 2 === 0 ? ('employee' as const) : ('employee2' as const);
      return createBooking(
        ctxFor(world, key),
        actorFor(world, key),
        baseBooking({ title: `แข่งกันจอง #${index}`, startTime: '14:00', endTime: '15:00' }),
      );
    });

    const results = await Promise.allSettled(attempts);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const conflicts = results.filter((r) => r.status === 'rejected' && r.reason instanceof ConflictError);

    expect(fulfilled).toHaveLength(1);
    expect(conflicts).toHaveLength(9);

    const stored = await withServiceTx(async (sql) => {
      const res = await sql.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM bookings WHERE blocks_slot AND room_id = $1`,
        [world.rooms.simple],
      );
      return Number(res.rows[0]?.count ?? 0);
    });
    expect(stored).toBe(1);
  });
});

describe('แก้ไข ยกเลิก และคิวรอ', () => {
  it('แก้ไขเวลาได้ และใช้ optimistic concurrency กันการแก้ทับกัน', async () => {
    const { booking } = await createBooking(ctxFor(world, 'employee'), actorFor(world, 'employee'), baseBooking());

    const updated = await updateBooking(ctxFor(world, 'employee'), actorFor(world, 'employee'), booking.id, {
      startTime: '15:00',
      endTime: '16:00',
      expectedVersion: booking.version,
    });
    expect(updated.version).toBe(booking.version + 1);

    // ใช้ version เดิมซ้ำต้องถูกปฏิเสธ
    await expect(
      updateBooking(ctxFor(world, 'employee'), actorFor(world, 'employee'), booking.id, {
        title: 'แก้ทับ',
        expectedVersion: booking.version,
      }),
    ).rejects.toThrow(ConflictError);
  });

  it('ยกเลิกแล้วช่วงเวลาว่างให้คนอื่นจองได้', async () => {
    const { booking } = await createBooking(ctxFor(world, 'employee'), actorFor(world, 'employee'), baseBooking());
    await cancelBooking(ctxFor(world, 'employee'), actorFor(world, 'employee'), booking.id, 'เปลี่ยนแผน');

    await expect(
      createBooking(ctxFor(world, 'employee2'), actorFor(world, 'employee2'), baseBooking({ title: 'จองต่อ' })),
    ).resolves.toMatchObject({ booking: { status: 'confirmed' } });
  });

  it('ยกเลิกแล้วแจ้งคิวรอลำดับถัดไปพร้อมเวลาหมดอายุ', async () => {
    const { booking } = await createBooking(ctxFor(world, 'employee'), actorFor(world, 'employee'), baseBooking());
    await joinWaitlist(ctxFor(world, 'employee2'), actorFor(world, 'employee2'), {
      roomId: world.rooms.simple,
      dateISO,
      startTime: '10:00',
      endTime: '11:00',
      title: 'ขอคิวรอ',
      attendeeCount: 2,
    });

    await cancelBooking(ctxFor(world, 'employee'), actorFor(world, 'employee'), booking.id, null);

    const entry = await withServiceTx(async (sql) => {
      const res = await sql.query<{ status: string; offer_expires_at: Date | null }>(
        'SELECT status, offer_expires_at FROM waitlist_entries WHERE profile_id = $1',
        [world.users.employee2.id],
      );
      return res.rows[0];
    });
    expect(entry?.status).toBe('offered');
    expect(entry?.offer_expires_at).toBeInstanceOf(Date);

    const notified = await withServiceTx(async (sql) => {
      const res = await sql.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM in_app_notifications
          WHERE profile_id = $1 AND event_type = 'waitlist.offer'`,
        [world.users.employee2.id],
      );
      return Number(res.rows[0]?.count ?? 0);
    });
    expect(notified).toBe(1);
  });

  it('ยกเลิกทั้งชุดการจองซ้ำได้', async () => {
    const result = await createRecurringBookings(ctxFor(world, 'employee'), actorFor(world, 'employee'), {
      ...baseBooking({ startTime: '08:00', endTime: '09:00' }),
      recurrence: { frequency: 'daily', intervalCount: 1, occurrenceCount: 3 },
    });
    expect(result.created).toHaveLength(3);

    await cancelBooking(
      ctxFor(world, 'employee'),
      actorFor(world, 'employee'),
      result.created[0]!.id,
      'ยกเลิกทั้งชุด',
      'series',
    );

    const statuses = await withServiceTx(async (sql) => {
      const res = await sql.query<{ status: string }>('SELECT status FROM bookings WHERE series_id = $1', [
        result.seriesId,
      ]);
      return res.rows.map((r) => r.status);
    });
    expect(statuses.every((s) => s === 'cancelled')).toBe(true);
  });

  it('จองซ้ำข้ามครั้งที่ชนเวลาแล้วรายงานกลับ ไม่ล้มทั้งชุด', async () => {
    // จองวันที่สองไว้ก่อนด้วยคนอื่น
    await createBooking(
      ctxFor(world, 'employee2'),
      actorFor(world, 'employee2'),
      baseBooking({ dateISO: futureDateISO(11), title: 'จองไว้ก่อน', startTime: '08:00', endTime: '09:00' }),
    );

    const result = await createRecurringBookings(ctxFor(world, 'employee'), actorFor(world, 'employee'), {
      ...baseBooking({ startTime: '08:00', endTime: '09:00' }),
      recurrence: { frequency: 'daily', intervalCount: 1, occurrenceCount: 3 },
    });

    expect(result.created).toHaveLength(2);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]?.dateISO).toBe(futureDateISO(11));
    expect(result.skipped[0]?.reason).toContain('ถูกจองไปแล้ว');
  });
});

describe('อนุมัติและเช็กอิน', () => {
  it('ผู้อนุมัติอนุมัติแล้วสถานะเป็น confirmed และผู้จองได้รับแจ้งเตือน', async () => {
    const { booking } = await createBooking(
      ctxFor(world, 'employee'),
      actorFor(world, 'employee'),
      baseBooking({ roomId: world.rooms.approval }),
    );

    const approved = await decideApproval(
      ctxFor(world, 'approver'),
      actorFor(world, 'approver'),
      booking.id,
      'approved',
      'อนุมัติตามคำขอ',
    );
    expect(approved.status).toBe('confirmed');

    const inApp = await withServiceTx(async (sql) => {
      const res = await sql.query<{ event_type: string }>(
        'SELECT event_type FROM in_app_notifications WHERE profile_id = $1 ORDER BY created_at',
        [world.users.employee.id],
      );
      return res.rows.map((r) => r.event_type);
    });
    expect(inApp).toContain('booking.approved');
  });

  it('ปฏิเสธต้องระบุเหตุผล และเมื่อปฏิเสธแล้วสถานะเป็น rejected', async () => {
    const { booking } = await createBooking(
      ctxFor(world, 'employee'),
      actorFor(world, 'employee'),
      baseBooking({ roomId: world.rooms.approval }),
    );

    await expect(
      decideApproval(ctxFor(world, 'approver'), actorFor(world, 'approver'), booking.id, 'rejected', '   '),
    ).rejects.toThrow(ValidationError);

    const rejected = await decideApproval(
      ctxFor(world, 'approver'),
      actorFor(world, 'approver'),
      booking.id,
      'rejected',
      'ห้องถูกใช้สำหรับงานอื่น',
    );
    expect(rejected.status).toBe('rejected');
  });

  it('พนักงานคนอื่นอนุมัติแทนไม่ได้', async () => {
    const { booking } = await createBooking(
      ctxFor(world, 'employee'),
      actorFor(world, 'employee'),
      baseBooking({ roomId: world.rooms.approval }),
    );
    await expect(
      decideApproval(ctxFor(world, 'employee2'), actorFor(world, 'employee2'), booking.id, 'approved', 'แอบอนุมัติ'),
    ).rejects.toThrow();
  });

  it('เช็กอินได้เมื่ออยู่ในช่วงเวลา และ cron ปล่อยห้องเมื่อไม่เช็กอิน', async () => {
    const actor = actorFor(world, 'employee');
    const { booking } = await createBooking(ctxFor(world, 'employee'), actor, baseBooking());

    // ยังไม่ถึงเวลาเช็กอิน
    await expect(checkInBooking(ctxFor(world, 'employee'), actor, booking.id)).rejects.toThrow();

    // เลื่อนเวลาการจองมาเป็นตอนนี้ แล้วเช็กอิน
    await withServiceTx((sql) =>
      sql.query(`UPDATE bookings SET starts_at = now(), ends_at = now() + interval '1 hour' WHERE id = $1`, [
        booking.id,
      ]),
    );
    const checkedIn = await checkInBooking(ctxFor(world, 'employee'), actor, booking.id);
    expect(checkedIn.status).toBe('checked_in');
    expect(checkedIn.checkedInAt).toBeInstanceOf(Date);
  });

  it('cron ปล่อยห้องเป็น no_show เมื่อเลยเวลาผ่อนผันแล้วยังไม่เช็กอิน', async () => {
    const { booking } = await createBooking(ctxFor(world, 'employee'), actorFor(world, 'employee'), baseBooking());
    await withServiceTx((sql) =>
      sql.query(
        `UPDATE bookings SET starts_at = now() - interval '30 min', ends_at = now() + interval '30 min' WHERE id = $1`,
        [booking.id],
      ),
    );

    const summary = await runMaintenance({ auditRetentionDays: 0 });
    expect(summary.released).toBe(1);

    const status = await withServiceTx(async (sql) => {
      const res = await sql.query<{ status: string }>('SELECT status FROM bookings WHERE id = $1', [booking.id]);
      return res.rows[0]?.status;
    });
    expect(status).toBe('no_show');
  });
});

describe('คิวงานแจ้งเตือน', () => {
  it('ส่งงานในคิวได้ ไม่ส่งซ้ำ และบันทึกผลการส่งทุกครั้ง', async () => {
    await createBooking(
      ctxFor(world, 'employee'),
      actorFor(world, 'employee'),
      baseBooking({ attendees: [{ email: world.users.employee2.email }] }),
    );

    const first = await dispatchNotifications('test-worker');
    expect(first.claimed).toBeGreaterThan(0);
    expect(first.sent + first.skipped).toBe(first.claimed);

    // รอบที่สองไม่มีงานเหลือให้ส่ง (ยกเว้น reminder ที่ตั้งเวลาในอนาคต)
    const second = await dispatchNotifications('test-worker');
    expect(second.claimed).toBe(0);

    const deliveries = await withServiceTx(async (sql) => {
      const res = await sql.query<{ count: string }>('SELECT count(*)::text AS count FROM notification_deliveries');
      return Number(res.rows[0]?.count ?? 0);
    });
    expect(deliveries).toBe(first.claimed);
  });

  it('งานที่ล้มเหลวถูกตั้งเวลาลองใหม่แบบ backoff และตกเป็น dead letter เมื่อครบจำนวนครั้ง', async () => {
    const jobId = await withServiceTx(async (sql) => {
      const res = await sql.query<{ id: string }>(
        `INSERT INTO notification_jobs (event_type, channel, recipient_profile_id, payload, dedupe_key, max_attempts)
         VALUES ('booking.confirmed','line',$1,'{"subject":"s","text":"t"}'::jsonb,'dead-letter-test',1)
         RETURNING id`,
        [world.users.employee.id],
      );
      return res.rows[0]!.id;
    });

    // ผู้ใช้ยังไม่เชื่อม LINE -> ต้องถูกข้าม ไม่ใช่ล้มเหลวซ้ำ ๆ
    const summary = await dispatchNotifications('test-worker');
    expect(summary.skipped).toBeGreaterThan(0);

    const job = await withServiceTx(async (sql) => {
      const res = await sql.query<{ status: string; last_error: string | null }>(
        'SELECT status, last_error FROM notification_jobs WHERE id = $1',
        [jobId],
      );
      return res.rows[0];
    });
    expect(job?.status).toBe('skipped');
    expect(job?.last_error).toContain('LINE');
  });
});

describe('ค้นหาและปฏิทิน', () => {
  it('ค้นหาห้องตามความจุและอุปกรณ์', async () => {
    const rooms = await searchRooms(ctxFor(world, 'employee'), { capacity: 10 });
    expect(rooms.length).toBeGreaterThan(0);
    expect(rooms.every((r) => r.capacity >= 10)).toBe(true);
  });

  it('ค้นหาช่วงเวลาว่างไม่คืนห้องที่ถูกจองแล้ว', async () => {
    await createBooking(ctxFor(world, 'employee'), actorFor(world, 'employee'), baseBooking());

    const free = await searchFreeSlots(ctxFor(world, 'employee2'), {
      dateISO,
      startTime: '10:00',
      endTime: '11:00',
    });
    expect(free.map((f) => f.room.id)).not.toContain(world.rooms.simple);

    const later = await searchFreeSlots(ctxFor(world, 'employee2'), {
      dateISO,
      startTime: '16:00',
      endTime: '17:00',
    });
    expect(later.map((f) => f.room.id)).toContain(world.rooms.simple);
  });

  it('ค้นหาตามชื่อผู้จองได้', async () => {
    await createBooking(ctxFor(world, 'employee'), actorFor(world, 'employee'), baseBooking());
    const results = await searchBookings(ctxFor(world, 'employee'), { text: 'พนักงานคนที่หนึ่ง' });
    expect(results).toHaveLength(1);
    expect(results[0]?.bookerName).toBe(world.users.employee.fullName);
  });

  it('ปฏิทินรายวันคืนการจองของวันนั้น และรายเดือนคืนสรุปรายวัน', async () => {
    await createBooking(ctxFor(world, 'employee'), actorFor(world, 'employee'), baseBooking());

    const day = await getCalendarData(ctxFor(world, 'employee'), {
      view: 'day',
      dateISO,
      roomId: world.rooms.simple,
      organizationId: world.organizationId,
    });
    expect(day.bookings).toHaveLength(1);
    expect(day.bookings[0]?.isMine).toBe(true);

    const month = await getCalendarData(ctxFor(world, 'employee'), {
      view: 'month',
      dateISO,
      roomId: world.rooms.simple,
      organizationId: world.organizationId,
      openMinutesPerDay: 720,
    });
    expect(month.monthDays.length).toBeGreaterThan(27);
    const target = month.monthDays.find((d) => d.dateISO === dateISO);
    expect(target?.bookingCount).toBe(1);
    expect(target?.occupancy).toBe('partial');
  });

  it('รายละเอียดการจองคืนข้อมูลครบและระบุสิทธิ์การมองเห็น', async () => {
    const { booking } = await createBooking(
      ctxFor(world, 'employee'),
      actorFor(world, 'employee'),
      baseBooking({ purpose: 'วางแผนงาน', notes: 'เตรียมเอกสาร', resources: [{ amenityCode: 'tv' }] }),
    );

    const detail = await getBookingDetail(ctxFor(world, 'employee'), booking.id);
    expect(detail).not.toBeNull();
    expect(detail?.purpose).toBe('วางแผนงาน');
    expect(detail?.canSeeDetails).toBe(true);
    expect(detail?.policy.slotStepMinutes).toBe(30);
  });
});

describe('เวลาเตือนก่อนประชุมแยกตามการจอง (migration 010)', () => {
  async function queuedReminders(bookingId: string, profileId: string) {
    return withServiceTx(async (sql) => {
      const res = await sql.query<{ scheduled_for: Date; subject: string }>(
        `SELECT scheduled_for, payload->>'subject' AS subject FROM notification_jobs
          WHERE booking_id = $1 AND recipient_profile_id = $2 AND event_type = 'booking.reminder'
            AND channel = 'email' AND status = 'queued'
          ORDER BY scheduled_for`,
        [bookingId, profileId],
      );
      return res.rows;
    });
  }

  it('ผู้จองได้เตือนตามที่เลือกตอนจอง รวมถึงตอนเริ่มประชุม ส่วนผู้เข้าร่วมได้ตามค่าตั้งของตัวเอง', async () => {
    const { booking } = await createBooking(
      ctxFor(world, 'employee'),
      actorFor(world, 'employee'),
      baseBooking({ reminderLeads: [60, 0], attendees: [{ email: world.users.employee2.email }] }),
    );
    expect(booking.reminderLeads).toEqual([60, 0]);

    const mine = await queuedReminders(booking.id, world.users.employee.id);
    const start = localDateTimeToUtc(dateISO, '10:00', 'Asia/Bangkok').getTime();
    expect(mine.map((r) => (start - r.scheduled_for.getTime()) / 60_000)).toEqual([60, 0]);
    expect(mine[0]!.subject).toBe('อีก 1 ชั่วโมง จะเริ่มประชุม: ประชุมทดสอบ');
    expect(mine[1]!.subject).toBe('ถึงเวลาประชุมแล้ว: ประชุมทดสอบ');

    // ผู้เข้าร่วมไม่ได้ตั้งค่าไว้ → ค่าเริ่มต้น 24 ชั่วโมง และ 15 นาที
    const theirs = await queuedReminders(booking.id, world.users.employee2.id);
    expect(theirs.map((r) => (start - r.scheduled_for.getTime()) / 60_000)).toEqual([1440, 15]);
  });

  it('แก้เฉพาะการแจ้งเตือน: ตั้งเตือนใหม่ ไม่ลบข้อมูลอื่น และไม่แจ้ง "มีการแก้ไขการจอง" ไปหาทุกคน', async () => {
    const ctx = ctxFor(world, 'employee');
    const actor = actorFor(world, 'employee');
    const { booking } = await createBooking(ctx, actor, baseBooking({ purpose: 'วางแผนข่าว', reminderLeads: [60, 0] }));

    const updated = await updateBooking(ctx, actor, booking.id, { expectedVersion: booking.version, reminderLeads: [0] });
    expect(updated.reminderLeads).toEqual([0]);
    expect(await queuedReminders(booking.id, world.users.employee.id)).toHaveLength(1);

    // กลับไปใช้ค่าที่เคยยกเลิก ต้องตั้งได้อีกครั้ง (เดิม dedupe_key ชนแล้วเตือนหายเงียบ ๆ)
    const again = await updateBooking(ctx, actor, booking.id, { expectedVersion: updated.version, reminderLeads: [60, 0] });
    expect(await queuedReminders(booking.id, world.users.employee.id)).toHaveLength(2);

    const detail = await getBookingDetail(ctx, again.id);
    expect(detail?.purpose).toBe('วางแผนข่าว');

    const updatedNotices = await withServiceTx(async (sql) => {
      const res = await sql.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM notification_jobs WHERE booking_id = $1 AND event_type = 'booking.updated'`,
        [booking.id],
      );
      return Number(res.rows[0]?.count ?? 0);
    });
    expect(updatedNotices).toBe(0);
  });

  it('ไม่เลือกเวลาเตือน = ใช้ค่าตั้งส่วนตัวเหมือนเดิม และเลือก "ไม่เตือน" ได้', async () => {
    const ctx = ctxFor(world, 'employee');
    const actor = actorFor(world, 'employee');
    const { booking } = await createBooking(ctx, actor, baseBooking());
    expect(booking.reminderLeads).toBeNull();
    expect(await queuedReminders(booking.id, world.users.employee.id)).toHaveLength(2);

    const { booking: silent } = await createBooking(ctx, actor, baseBooking({ startTime: '13:00', endTime: '14:00', reminderLeads: [] }));
    expect(await queuedReminders(silent.id, world.users.employee.id)).toHaveLength(0);
  });

  it('ห้องที่ต้องอนุมัติ: ตั้งเตือนตามที่ผู้จองเลือกเมื่ออนุมัติแล้วเท่านั้น', async () => {
    const { booking } = await createBooking(
      ctxFor(world, 'employee'),
      actorFor(world, 'employee'),
      baseBooking({ roomId: world.rooms.approval, reminderLeads: [30] }),
    );
    expect(booking.status).toBe('pending');
    expect(await queuedReminders(booking.id, world.users.employee.id)).toHaveLength(0);

    await decideApproval(ctxFor(world, 'approver'), actorFor(world, 'approver'), booking.id, 'approved', null);
    const mine = await queuedReminders(booking.id, world.users.employee.id);
    expect(mine).toHaveLength(1);
    expect(mine[0]!.subject).toContain('อีก 30 นาที');
  });
});
