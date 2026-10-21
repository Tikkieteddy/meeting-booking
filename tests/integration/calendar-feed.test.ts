/**
 * ลิงก์ปฏิทินส่วนตัว (ADR-020): โทเค็นเก็บแค่ hash, สร้างใหม่แล้วลิงก์เดิมตาย, ปิดได้,
 * ในปฏิทินมีเฉพาะการจองที่เจ้าของลิงก์เป็นผู้จองหรือถูกเชิญ และไม่มีการจองที่ยกเลิก
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closePool, withServiceTx, withTx } from '@/lib/db/pool';
import { cancelBooking, createBooking } from '@/lib/domain/booking-service';
import { buildFeedForToken, createFeedToken, getFeedStatus, revokeFeedToken } from '@/lib/domain/calendar-feed';
import { actorFor, ctxFor, futureDateISO, resetTransactionalData, seedWorld, type TestWorld } from './fixtures';

let world: TestWorld;
const APP = 'https://meeting.example.com';

beforeAll(async () => {
  world = await seedWorld();
});
beforeEach(async () => {
  await resetTransactionalData();
  await withServiceTx((sql) => sql.query('DELETE FROM calendar_feed_tokens'));
});
afterAll(async () => {
  await closePool();
});

const me = () => ({ profileId: world.users.employee.id, email: world.users.employee.email });

function book(who: 'employee' | 'employee2', title: string, start: string, attendees: string[] = []) {
  return createBooking(ctxFor(world, who), actorFor(world, who), {
    roomId: world.rooms.simple,
    title,
    dateISO: futureDateISO(10),
    startTime: start,
    endTime: `${String(Number(start.slice(0, 2)) + 1).padStart(2, '0')}:00`,
    attendeeCount: 2,
    attendees: attendees.map((email) => ({ email })),
  });
}

describe('ลิงก์ปฏิทินส่วนตัว', () => {
  it('มีการจองของตัวเองและที่ถูกเชิญ ไม่มีของคนอื่น และไม่มีที่ยกเลิกแล้ว', async () => {
    await book('employee', 'ของฉันเอง', '09:00');
    await book('employee2', 'คนอื่นเชิญฉัน', '11:00', [world.users.employee.email]);
    await book('employee2', 'ของคนอื่นล้วน', '13:00');
    const { booking: cancelled } = await book('employee', 'ยกเลิกแล้ว', '15:00');
    await cancelBooking(ctxFor(world, 'employee'), actorFor(world, 'employee'), cancelled.id, 'เลื่อน');

    const token = await createFeedToken(ctxFor(world, 'employee'), me());
    const ics = (await buildFeedForToken(token, APP))!.replace(/\r\n /g, '');
    expect(ics).toContain('SUMMARY:ของฉันเอง');
    expect(ics).toContain('SUMMARY:คนอื่นเชิญฉัน');
    expect(ics).not.toContain('ของคนอื่นล้วน');
    expect(ics).not.toContain('ยกเลิกแล้ว');
    expect(ics).toContain(`URL:${APP}/bookings/`);

    const status = await getFeedStatus(ctxFor(world, 'employee'), world.users.employee.id);
    expect(status.active).toBe(true);
    expect(status.lastAccessedAt).not.toBeNull();
  });

  it('เก็บแค่ hash, สร้างใหม่แล้วลิงก์เดิมใช้ไม่ได้, ปิดแล้วใช้ไม่ได้, โทเค็นมั่วได้ null', async () => {
    const first = await createFeedToken(ctxFor(world, 'employee'), me());
    const stored = await withServiceTx(async (sql) =>
      (await sql.query<{ token_hash: string }>('SELECT token_hash FROM calendar_feed_tokens')).rows,
    );
    expect(stored).toHaveLength(1);
    expect(stored[0]!.token_hash).not.toContain(first);

    const second = await createFeedToken(ctxFor(world, 'employee'), me());
    expect(await buildFeedForToken(first, APP)).toBeNull();
    expect(await buildFeedForToken(second, APP)).not.toBeNull();

    await revokeFeedToken(ctxFor(world, 'employee'), me());
    expect(await buildFeedForToken(second, APP)).toBeNull();
    expect(await buildFeedForToken('x'.repeat(43), APP)).toBeNull();
    expect(await buildFeedForToken("'; DROP TABLE bookings; --", APP)).toBeNull();
  });

  it('RLS: คนอื่น (แม้ผู้ดูแลระบบ) มองไม่เห็นและลบลิงก์ของเราไม่ได้', async () => {
    await createFeedToken(ctxFor(world, 'employee'), me());
    for (const who of ['employee2', 'admin'] as const) {
      const seen = await withTx(ctxFor(world, who), (sql) => sql.query('SELECT 1 FROM calendar_feed_tokens'));
      expect(seen.rowCount).toBe(0);
      const deleted = await withTx(ctxFor(world, who), (sql) =>
        sql.query('DELETE FROM calendar_feed_tokens WHERE profile_id = $1', [world.users.employee.id]),
      );
      expect(deleted.rowCount).toBe(0);
    }
    // แอบสร้างลิงก์ในนามคนอื่นไม่ได้
    await expect(
      withTx(ctxFor(world, 'employee2'), (sql) =>
        sql.query('INSERT INTO calendar_feed_tokens (profile_id, token_hash) VALUES ($1, $2)', [
          world.users.employee.id,
          'a'.repeat(64),
        ]),
      ),
    ).rejects.toThrow();
  });
});
