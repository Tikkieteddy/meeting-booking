import { closureSchema } from '@/lib/validation/schemas';
import { withTx } from '@/lib/db/pool';
import { writeAudit } from '@/lib/audit';
import { currentActor } from '@/lib/api/actor';
import { requirePermission } from '@/lib/auth/current-user';
import { apiOk, withApi } from '@/lib/api/respond';
import { enqueueNotification, pushInApp } from '@/lib/notify/queue';

export const dynamic = 'force-dynamic';

export const GET = withApi(async (_request: Request, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  const { ctx } = await currentActor();
  const closures = await withTx(ctx, async (sql) => {
    const res = await sql.query<{ id: string; starts_at: Date; ends_at: Date; reason: string }>(
      'SELECT id, starts_at, ends_at, reason FROM room_closures WHERE room_id = $1 ORDER BY starts_at DESC LIMIT 100',
      [id],
    );
    return res.rows.map((r) => ({
      id: r.id,
      startsAt: r.starts_at.toISOString(),
      endsAt: r.ends_at.toISOString(),
      reason: r.reason,
    }));
  });
  return apiOk({ closures });
});

/** ปิดห้องกะทันหัน — แจ้งผู้ที่ได้รับผลกระทบทันทีพร้อมคำแนะนำเลือกห้องใหม่ (บรีฟข้อ 10) */
export const POST = withApi(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  await requirePermission('room:manage');
  const { id } = await context.params;
  const { actor, ctx } = await currentActor();
  const input = closureSchema.parse({ ...(await request.json()), roomId: id });

  const affected = await withTx(ctx, async (sql) => {
    const closure = await sql.query<{ id: string }>(
      `INSERT INTO room_closures (room_id, starts_at, ends_at, reason, created_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [id, input.startsAt, input.endsAt, input.reason, actor.profileId],
    );

    const impacted = await sql.query<{
      id: string;
      title: string;
      booker_profile_id: string;
      booker_email: string;
      room_name: string;
    }>(
      `SELECT b.id, b.title, b.booker_profile_id, b.booker_email, r.name AS room_name
         FROM bookings b JOIN rooms r ON r.id = b.room_id
        WHERE b.room_id = $1
          AND b.status IN ('pending','confirmed','checked_in')
          AND tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange($2, $3, '[)')`,
      [id, input.startsAt, input.endsAt],
    );

    for (const booking of impacted.rows) {
      const payload = {
        subject: `ห้องประชุมปิดให้บริการ: ${booking.room_name}`,
        text: `การประชุม "${booking.title}" ได้รับผลกระทบจากการปิดห้อง\nเหตุผล: ${input.reason}\nกรุณาเลือกห้องอื่นหรือเวลาอื่นแทน`,
        link: `/calendar?date=${input.startsAt.slice(0, 10)}`,
      };
      await enqueueNotification(sql, {
        eventType: 'room.closed',
        channel: 'email',
        bookingId: booking.id,
        recipientProfileId: booking.booker_profile_id,
        recipientAddress: booking.booker_email,
        payload,
      });
      await pushInApp(sql, {
        profileId: booking.booker_profile_id,
        eventType: 'room.closed',
        title: payload.subject,
        body: payload.text,
        link: payload.link,
        bookingId: booking.id,
      });
    }

    await writeAudit(sql, {
      actorProfileId: actor.profileId,
      actorEmail: actor.email,
      action: 'room.closure_create',
      resourceType: 'room',
      resourceId: id,
      after: { ...input, impactedBookings: impacted.rowCount },
      ipHint: actor.ipHint,
    });

    return { closureId: closure.rows[0]!.id, impacted: impacted.rowCount };
  });

  return apiOk(affected, { status: 201 });
});
