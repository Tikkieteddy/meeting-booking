import 'server-only';
import { asService, lockRoom, withTx, type DbContext, type Sql } from '@/lib/db/pool';
import { writeAudit } from '@/lib/audit';
import { t } from '@/lib/i18n';
import { enqueueNotification, pushInApp, cancelPendingJobs } from '@/lib/notify/queue';
import { formatThaiDate, formatTimeRange, localDateTimeToUtc, toDateISO, DEFAULT_TZ } from '@/lib/util/time';
import { logger } from '@/lib/util/logger';
import { blockedHolidayDates, findClosureConflict, getRoomWith, type Room } from './rooms';
import { blockedRange, canCancel, isWithinCheckInWindow, validateBookingRequest, type RoomPolicy } from './booking-rules';
import { expandRecurrence, type RecurrenceRule } from './recurrence';
import { ConflictError, DomainError, ForbiddenError, NotFoundError, ValidationError, PG_ERROR, pgErrorCode } from './errors';
import { newToken } from '@/lib/auth/tokens';

export type BookingStatus =
  | 'draft'
  | 'pending'
  | 'confirmed'
  | 'rejected'
  | 'cancelled'
  | 'checked_in'
  | 'completed'
  | 'no_show'
  | 'maintenance';

export type Actor = {
  profileId: string;
  organizationId: string;
  email: string;
  fullName: string;
  department: string | null;
  permissions: readonly string[];
  ipHint?: string | null;
  userAgent?: string | null;
  correlationId?: string | null;
};

export type AttendeeInput = { email: string; displayName?: string | null; profileId?: string | null };

export type CreateBookingInput = {
  roomId: string;
  title: string;
  purpose?: string | null;
  notes?: string | null;
  /** วันที่และเวลาในโซนเวลาท้องถิ่น ('YYYY-MM-DD' และ 'HH:mm') — ระบบแปลงเป็น UTC ก่อนเก็บ */
  dateISO: string;
  startTime: string;
  endTime: string;
  attendeeCount: number;
  attendees?: AttendeeInput[];
  resources?: { amenityCode: string; quantity?: number; note?: string | null }[];
  privacy?: 'public' | 'busy_only' | 'private';
  recurrence?: RecurrenceRule | null;
  idempotencyKey?: string | null;
  /** ผู้ดูแลระบบข้ามข้อจำกัดได้ ต้องระบุเหตุผลและถูกบันทึกลง audit log */
  overrideReason?: string | null;
};

export type BookingRecord = {
  id: string;
  roomId: string;
  roomName: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  status: BookingStatus;
  privacy: string;
  seriesId: string | null;
  bookerProfileId: string;
  bookerName: string;
  attendeeCount: number;
  version: number;
  checkedInAt: Date | null;
};

const ACTIVE_STATUSES: BookingStatus[] = ['pending', 'confirmed', 'checked_in'];

function timezoneOf(): string {
  return process.env.APP_TIMEZONE || DEFAULT_TZ;
}

async function loadRoomOrThrow(sql: Sql, roomId: string): Promise<Room> {
  const room = await getRoomWith(sql, roomId);
  if (!room) throw new NotFoundError('ไม่พบห้องประชุมที่เลือก');
  return room;
}

/** หาการจองที่ชนกับช่วงเวลาที่ขอ (รวม buffer) เพื่อใช้อธิบายให้ผู้ใช้เข้าใจ */
async function findConflict(
  sql: Sql,
  roomId: string,
  startsAt: Date,
  endsAt: Date,
  excludeBookingId?: string,
): Promise<{ title: string; starts_at: Date; ends_at: Date } | null> {
  const res = await sql.query<{ title: string; starts_at: Date; ends_at: Date }>(
    `SELECT v.title, v.starts_at, v.ends_at
       FROM app.v_calendar_bookings v
       JOIN bookings b ON b.id = v.id
      WHERE b.room_id = $1
        AND b.blocks_slot
        AND b.blocked_period && tstzrange($2, $3, '[)')
        AND ($4::uuid IS NULL OR b.id <> $4::uuid)
      ORDER BY v.starts_at
      LIMIT 1`,
    [roomId, startsAt, endsAt, excludeBookingId ?? null],
  );
  return res.rows[0] ?? null;
}

function conflictError(conflict: { title: string; starts_at: Date; ends_at: Date } | null): ConflictError {
  if (!conflict) return new ConflictError(t('error.conflict'));
  return new ConflictError(
    `${t('error.conflict')} — ${t('error.conflictDetail', {
      title: conflict.title,
      range: formatTimeRange(conflict.starts_at, conflict.ends_at, timezoneOf()),
    })}`,
    { conflictStart: conflict.starts_at.toISOString(), conflictEnd: conflict.ends_at.toISOString() },
  );
}

async function assertBookable(
  sql: Sql,
  actor: Actor,
  room: Room,
  startsAt: Date,
  endsAt: Date,
  input: { attendeeCount: number; overrideReason?: string | null },
  excludeBookingId?: string,
): Promise<void> {
  const isAdmin = actor.permissions.includes('booking:manage_all') || actor.permissions.includes('room:manage');
  const override = isAdmin && input.overrideReason ? { capacity: true, pastTime: true, reason: input.overrideReason } : {};

  const dateISO = toDateISO(startsAt, timezoneOf());
  const blockedDates = await blockedHolidayDates(sql, actor.organizationId, room.id, dateISO, dateISO);

  const violations = validateBookingRequest({
    policy: room.policy,
    startsAt,
    endsAt,
    timezone: timezoneOf(),
    attendeeCount: input.attendeeCount,
    override,
    blockedDates,
  });
  if (violations.length > 0) throw new ValidationError(t('error.validation'), violations);

  // ล็อกห้องไว้ก่อน เพื่อไม่ให้สองคำขอตรวจเวลาว่างพร้อมกันแล้วผ่านทั้งคู่
  await lockRoom(sql, room.id);

  const closure = await findClosureConflict(sql, room.id, startsAt, endsAt);
  if (closure) throw new ConflictError(t('error.roomClosed', { reason: closure.reason }));

  const range = blockedRange(room.policy, startsAt, endsAt);
  const conflict = await findConflict(sql, room.id, range.start, range.end, excludeBookingId);
  if (conflict) throw conflictError(conflict);
}

async function syncAttendees(sql: Sql, bookingId: string, attendees: AttendeeInput[]): Promise<string[]> {
  await sql.query('DELETE FROM booking_attendees WHERE booking_id = $1', [bookingId]);
  const profileIds: string[] = [];
  for (const a of attendees) {
    const email = a.email.trim().toLowerCase();
    if (!email) continue;
    // ผู้เข้าร่วมที่เป็นคนในองค์กรจะจับคู่กับ profile ให้อัตโนมัติ
    // ต้องใช้สิทธิ์ระบบ เพราะ RLS ของ profiles เปิดให้อ่านได้เฉพาะแถวของตัวเอง
    // (ค้นด้วยอีเมลที่ผู้จองพิมพ์เข้ามาเท่านั้น ไม่ได้เปิดให้ไล่ดูรายชื่อทั้งองค์กร)
    const match = await asService(sql, () =>
      sql.query<{ id: string; full_name: string }>(
        'SELECT id, full_name FROM profiles WHERE lower(email) = $1 LIMIT 1',
        [email],
      ),
    );
    const profileId = a.profileId ?? match.rows[0]?.id ?? null;
    if (profileId) profileIds.push(profileId);
    await sql.query(
      `INSERT INTO booking_attendees (booking_id, profile_id, email, display_name, kind)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (booking_id, lower(email)) DO NOTHING`,
      [bookingId, profileId, email, a.displayName ?? match.rows[0]?.full_name ?? null, profileId ? 'internal' : 'external'],
    );
  }
  // อัปเดตสำเนา profile id ที่ RLS ใช้ตัดสินสิทธิ์การมองเห็น
  await sql.query('UPDATE bookings SET attendee_profile_ids = $2::uuid[] WHERE id = $1', [bookingId, profileIds]);
  return profileIds;
}

async function syncResources(
  sql: Sql,
  bookingId: string,
  resources: { amenityCode: string; quantity?: number; note?: string | null }[],
) {
  await sql.query('DELETE FROM booking_resources WHERE booking_id = $1', [bookingId]);
  for (const r of resources) {
    await sql.query(
      `INSERT INTO booking_resources (booking_id, amenity_code, quantity, note) VALUES ($1,$2,$3,$4)
       ON CONFLICT (booking_id, amenity_code) DO NOTHING`,
      [bookingId, r.amenityCode, r.quantity ?? 1, r.note ?? null],
    );
  }
}

function bookingLink(bookingId: string): string {
  return `/bookings/${bookingId}`;
}

async function notifyBookingEvent(
  sql: Sql,
  actor: Actor,
  booking: { id: string; title: string; startsAt: Date; endsAt: Date; roomName: string; bookerProfileId: string; bookerEmail: string; privacy: string },
  event: 'booking.confirmed' | 'booking.pending_approval' | 'booking.updated' | 'booking.cancelled' | 'booking.approved' | 'booking.rejected',
  extra: { attendeeProfileIds?: string[]; attendeeEmails?: string[]; approverProfileIds?: string[]; reason?: string | null } = {},
) {
  const when = `${formatThaiDate(toDateISO(booking.startsAt, timezoneOf()))} ${formatTimeRange(
    booking.startsAt,
    booking.endsAt,
    timezoneOf(),
  )}`;
  const titles: Record<typeof event, string> = {
    'booking.confirmed': `ยืนยันการจองแล้ว: ${booking.title}`,
    'booking.pending_approval': `รออนุมัติ: ${booking.title}`,
    'booking.updated': `แก้ไขการจอง: ${booking.title}`,
    'booking.cancelled': `ยกเลิกการจอง: ${booking.title}`,
    'booking.approved': `อนุมัติแล้ว: ${booking.title}`,
    'booking.rejected': `ถูกปฏิเสธ: ${booking.title}`,
  };
  const subject = titles[event];
  const body = `ห้อง ${booking.roomName}\n${when}${extra.reason ? `\nเหตุผล: ${extra.reason}` : ''}`;

  const payload = {
    subject,
    text: body,
    link: bookingLink(booking.id),
    data: { room: booking.roomName, when, title: booking.title },
    attachIcs: event !== 'booking.cancelled' && event !== 'booking.rejected',
  };

  // ผู้จองเสมอ
  await enqueueNotification(sql, {
    eventType: event,
    channel: 'email',
    bookingId: booking.id,
    recipientProfileId: booking.bookerProfileId,
    recipientAddress: booking.bookerEmail,
    payload,
    correlationId: actor.correlationId ?? null,
  });
  await enqueueNotification(sql, {
    eventType: event,
    channel: 'line',
    bookingId: booking.id,
    recipientProfileId: booking.bookerProfileId,
    payload,
    correlationId: actor.correlationId ?? null,
  });
  await pushInApp(sql, {
    profileId: booking.bookerProfileId,
    eventType: event,
    title: subject,
    body,
    link: bookingLink(booking.id),
    bookingId: booking.id,
  });

  // ผู้เข้าร่วม — ไม่ส่งรายละเอียดของการประชุมแบบ private เกินจำเป็น (บรีฟข้อ 10)
  const attendeePayload =
    booking.privacy === 'private'
      ? { ...payload, subject: 'มีการนัดประชุมที่คุณเกี่ยวข้อง', text: `ห้อง ${booking.roomName}\n${when}` }
      : payload;
  for (const email of extra.attendeeEmails ?? []) {
    if (email.toLowerCase() === booking.bookerEmail.toLowerCase()) continue;
    await enqueueNotification(sql, {
      eventType: event,
      channel: 'email',
      bookingId: booking.id,
      recipientAddress: email,
      payload: attendeePayload,
      correlationId: actor.correlationId ?? null,
    });
  }
  for (const profileId of extra.attendeeProfileIds ?? []) {
    if (profileId === booking.bookerProfileId) continue;
    await pushInApp(sql, {
      profileId,
      eventType: event,
      title: attendeePayload.subject,
      body: attendeePayload.text,
      link: bookingLink(booking.id),
      bookingId: booking.id,
    });
  }

  // ผู้อนุมัติ
  for (const approverId of extra.approverProfileIds ?? []) {
    await enqueueNotification(sql, {
      eventType: event,
      channel: 'email',
      bookingId: booking.id,
      recipientProfileId: approverId,
      payload: { ...payload, subject: `[ต้องอนุมัติ] ${booking.title}`, link: '/approvals' },
      correlationId: actor.correlationId ?? null,
    });
    await pushInApp(sql, {
      profileId: approverId,
      eventType: event,
      title: `[ต้องอนุมัติ] ${booking.title}`,
      body,
      link: '/approvals',
      bookingId: booking.id,
    });
  }
}

async function scheduleReminders(sql: Sql, bookingId: string, profileId: string, booking: { title: string; startsAt: Date; endsAt: Date; roomName: string }) {
  // อ่านค่าตั้งการแจ้งเตือนของ "ผู้จอง" ซึ่งอาจไม่ใช่ผู้ที่กำลังทำรายการ (เช่น ผู้อนุมัติกดอนุมัติ)
  const prefRes = await asService(sql, () =>
    sql.query<{ reminder_leads: number[]; email_enabled: boolean; line_enabled: boolean }>(
      'SELECT reminder_leads, email_enabled, line_enabled FROM notification_preferences WHERE profile_id = $1',
      [profileId],
    ),
  );
  const pref = prefRes.rows[0] ?? { reminder_leads: [1440, 15], email_enabled: true, line_enabled: false };
  const when = `${formatThaiDate(toDateISO(booking.startsAt, timezoneOf()))} ${formatTimeRange(booking.startsAt, booking.endsAt, timezoneOf())}`;

  for (const lead of pref.reminder_leads ?? []) {
    const scheduledFor = new Date(booking.startsAt.getTime() - lead * 60_000);
    if (scheduledFor.getTime() <= Date.now()) continue;
    const payload = {
      subject: `เตือนประชุม: ${booking.title}`,
      text: `ห้อง ${booking.roomName}\n${when}`,
      link: bookingLink(bookingId),
      data: { lead: String(lead) },
    };
    if (pref.email_enabled) {
      await enqueueNotification(sql, {
        eventType: 'booking.reminder',
        channel: 'email',
        bookingId,
        recipientProfileId: profileId,
        payload,
        scheduledFor,
      });
    }
    if (pref.line_enabled) {
      await enqueueNotification(sql, {
        eventType: 'booking.reminder',
        channel: 'line',
        bookingId,
        recipientProfileId: profileId,
        payload,
        scheduledFor,
      });
    }
  }
}

// ============================================================
// สร้างการจอง
// ============================================================
export async function createBooking(
  ctx: DbContext,
  actor: Actor,
  input: CreateBookingInput,
): Promise<{ booking: BookingRecord; requiresApproval: boolean }> {
  const tz = timezoneOf();
  const startsAt = localDateTimeToUtc(input.dateISO, input.startTime, tz);
  const endsAt = localDateTimeToUtc(input.dateISO, input.endTime, tz);

  return withTx(ctx, async (sql) => {
    const room = await loadRoomOrThrow(sql, input.roomId);

    // กันกดซ้ำ: ถ้ามี idempotency key เดิมอยู่แล้วให้คืนรายการเดิม ไม่สร้างซ้ำ
    if (input.idempotencyKey) {
      const existing = await sql.query<{ id: string }>(
        'SELECT id FROM bookings WHERE booker_profile_id = $1 AND idempotency_key = $2',
        [actor.profileId, input.idempotencyKey],
      );
      const existingId = existing.rows[0]?.id;
      if (existingId) {
        const record = await getBookingRecord(sql, existingId);
        if (record) return { booking: record, requiresApproval: record.status === 'pending' };
      }
    }

    await assertBookable(sql, actor, room, startsAt, endsAt, input);

    const status: BookingStatus = room.policy.requiresApproval ? 'pending' : 'confirmed';
    const privacy = input.privacy ?? 'public';

    let bookingId: string;
    try {
      const res = await sql.query<{ id: string }>(
        `INSERT INTO bookings (organization_id, room_id, title, purpose, notes, starts_at, ends_at,
                               buffer_before_minutes, buffer_after_minutes, status, privacy,
                               booker_profile_id, booker_name, booker_email, booker_department,
                               attendee_count, capacity_override_reason, check_in_token,
                               idempotency_key, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$12)
         RETURNING id`,
        [
          actor.organizationId,
          room.id,
          input.title.trim(),
          input.purpose ?? null,
          input.notes ?? null,
          startsAt,
          endsAt,
          room.policy.bufferBeforeMinutes,
          room.policy.bufferAfterMinutes,
          status,
          privacy,
          actor.profileId,
          actor.fullName,
          actor.email,
          actor.department,
          input.attendeeCount,
          input.overrideReason ?? null,
          room.policy.checkInRequired ? newToken(12) : null,
          input.idempotencyKey ?? null,
        ],
      );
      bookingId = res.rows[0]!.id;
    } catch (error) {
      if (pgErrorCode(error) === PG_ERROR.exclusionViolation) {
        // ชั้นสุดท้ายของการกันจองซ้อน: ฐานข้อมูลปฏิเสธเอง แม้สองคำขอเข้ามาพร้อมกัน
        const range = blockedRange(room.policy, startsAt, endsAt);
        throw conflictError(await findConflict(sql, room.id, range.start, range.end));
      }
      throw error;
    }

    const attendeeProfileIds = await syncAttendees(sql, bookingId, input.attendees ?? []);
    await syncResources(sql, bookingId, input.resources ?? []);

    const approverIds: string[] = [];
    if (status === 'pending') {
      const approvers = await sql.query<{ profile_id: string; step: number }>(
        'SELECT profile_id, step FROM room_approvers WHERE room_id = $1 ORDER BY step',
        [room.id],
      );
      // แถวคำขออนุมัติถูกสร้างโดยระบบ ผู้จองไม่มีสิทธิ์เขียนตาราง approvals ตาม RLS
      await asService(sql, async () => {
        for (const a of approvers.rows) {
          await sql.query('INSERT INTO approvals (booking_id, approver_id, step) VALUES ($1,$2,$3)', [
            bookingId,
            a.profile_id,
            a.step,
          ]);
          approverIds.push(a.profile_id);
        }
        if (approvers.rows.length === 0) {
          // ห้องตั้งว่าต้องอนุมัติแต่ยังไม่ได้กำหนดผู้อนุมัติ — แจ้งผู้ดูแลระบบให้ตั้งค่า
          await sql.query('INSERT INTO approvals (booking_id, approver_id, step) VALUES ($1, NULL, 1)', [bookingId]);
          logger.warn('ห้องต้องอนุมัติแต่ยังไม่มีผู้อนุมัติ', { roomId: room.id });
        }
      });
    }

    const notifyInfo = {
      id: bookingId,
      title: input.title.trim(),
      startsAt,
      endsAt,
      roomName: room.name,
      bookerProfileId: actor.profileId,
      bookerEmail: actor.email,
      privacy,
    };
    await notifyBookingEvent(
      sql,
      actor,
      notifyInfo,
      status === 'pending' ? 'booking.pending_approval' : 'booking.confirmed',
      {
        attendeeProfileIds,
        attendeeEmails: (input.attendees ?? []).map((a) => a.email),
        approverProfileIds: approverIds,
      },
    );
    if (status === 'confirmed') {
      await scheduleReminders(sql, bookingId, actor.profileId, { title: input.title, startsAt, endsAt, roomName: room.name });
    }

    await writeAudit(sql, {
      actorProfileId: actor.profileId,
      actorEmail: actor.email,
      action: 'booking.create',
      resourceType: 'booking',
      resourceId: bookingId,
      after: { roomId: room.id, title: input.title, startsAt, endsAt, status, privacy },
      ipHint: actor.ipHint,
      userAgent: actor.userAgent,
      correlationId: actor.correlationId,
    });

    const record = await getBookingRecord(sql, bookingId);
    return { booking: record!, requiresApproval: status === 'pending' };
  });
}

/** จองซ้ำทั้งชุด — ครั้งที่ชนเวลาจะถูกข้ามและรายงานกลับไป ไม่ล้มทั้งชุด */
export async function createRecurringBookings(
  ctx: DbContext,
  actor: Actor,
  input: CreateBookingInput & { recurrence: RecurrenceRule },
): Promise<{ created: BookingRecord[]; skipped: { dateISO: string; reason: string }[]; seriesId: string }> {
  const dates = expandRecurrence(input.dateISO, input.recurrence);
  const created: BookingRecord[] = [];
  const skipped: { dateISO: string; reason: string }[] = [];

  const seriesId = await withTx(ctx, async (sql) => {
    const res = await sql.query<{ id: string }>(
      `INSERT INTO booking_series (room_id, created_by, frequency, interval_count, by_weekdays, until_date, occurrence_count)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [
        input.roomId,
        actor.profileId,
        input.recurrence.frequency,
        input.recurrence.intervalCount,
        input.recurrence.byWeekdays ?? null,
        input.recurrence.untilDate ?? null,
        input.recurrence.occurrenceCount ?? null,
      ],
    );
    return res.rows[0]!.id;
  });

  for (const dateISO of dates) {
    try {
      const { booking } = await createBooking(ctx, actor, {
        ...input,
        dateISO,
        idempotencyKey: input.idempotencyKey ? `${input.idempotencyKey}:${dateISO}` : null,
        recurrence: null,
      });
      await withTx(ctx, (sql) => sql.query('UPDATE bookings SET series_id = $2 WHERE id = $1', [booking.id, seriesId]));
      created.push({ ...booking, seriesId });
    } catch (error) {
      if (error instanceof DomainError) skipped.push({ dateISO, reason: error.message });
      else throw error;
    }
  }

  return { created, skipped, seriesId };
}

// ============================================================
// อ่านข้อมูลการจอง
// ============================================================
export async function getBookingRecord(sql: Sql, bookingId: string): Promise<BookingRecord | null> {
  const res = await sql.query<{
    id: string;
    room_id: string;
    room_name: string;
    title: string;
    starts_at: Date;
    ends_at: Date;
    status: BookingStatus;
    privacy: string;
    series_id: string | null;
    booker_profile_id: string;
    booker_name: string;
    attendee_count: number;
    version: number;
    checked_in_at: Date | null;
  }>(
    `SELECT b.id, b.room_id, r.name AS room_name, b.title, b.starts_at, b.ends_at, b.status, b.privacy,
            b.series_id, b.booker_profile_id, b.booker_name, b.attendee_count, b.version, b.checked_in_at
       FROM bookings b JOIN rooms r ON r.id = b.room_id
      WHERE b.id = $1`,
    [bookingId],
  );
  const row = res.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    roomId: row.room_id,
    roomName: row.room_name,
    title: row.title,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
    privacy: row.privacy,
    seriesId: row.series_id,
    bookerProfileId: row.booker_profile_id,
    bookerName: row.booker_name,
    attendeeCount: row.attendee_count,
    version: row.version,
    checkedInAt: row.checked_in_at,
  };
}

export type BookingDetail = BookingRecord & {
  purpose: string | null;
  notes: string | null;
  bookerEmail: string;
  bookerDepartment: string | null;
  roomCode: string;
  roomCapacity: number;
  createdAt: Date;
  cancelReason: string | null;
  canSeeDetails: boolean;
  attendees: { email: string; displayName: string | null; kind: string; response: string }[];
  resources: { amenityCode: string; nameTh: string; quantity: number }[];
  approvals: { id: string; step: number; status: string; comment: string | null; approverName: string | null; decidedAt: Date | null }[];
  policy: RoomPolicy;
};

export async function getBookingDetail(ctx: DbContext, bookingId: string): Promise<BookingDetail | null> {
  return withTx(ctx, async (sql) => {
    const base = await getBookingRecord(sql, bookingId);
    if (!base) return null;
    const extra = await sql.query<{
      purpose: string | null;
      notes: string | null;
      booker_email: string;
      booker_department: string | null;
      room_code: string;
      room_capacity: number;
      created_at: Date;
      cancel_reason: string | null;
      can_see_details: boolean;
    }>(
      `SELECT b.purpose, b.notes, b.booker_email, b.booker_department, r.code AS room_code,
              r.capacity AS room_capacity, b.created_at, b.cancel_reason,
              app.can_see_booking_details(b.booker_profile_id, b.room_id, b.privacy, b.attendee_profile_ids) AS can_see_details
         FROM bookings b JOIN rooms r ON r.id = b.room_id WHERE b.id = $1`,
      [bookingId],
    );
    const e = extra.rows[0]!;
    const attendees = await sql.query<{ email: string; display_name: string | null; kind: string; response: string }>(
      'SELECT email, display_name, kind, response FROM booking_attendees WHERE booking_id = $1 ORDER BY email',
      [bookingId],
    );
    const resources = await sql.query<{ amenity_code: string; name_th: string; quantity: number }>(
      `SELECT br.amenity_code, a.name_th, br.quantity
         FROM booking_resources br JOIN amenities a ON a.code = br.amenity_code
        WHERE br.booking_id = $1 ORDER BY a.sort_order`,
      [bookingId],
    );
    const approvals = await sql.query<{
      id: string;
      step: number;
      status: string;
      comment: string | null;
      approver_name: string | null;
      decided_at: Date | null;
    }>(
      `SELECT ap.id, ap.step, ap.status, ap.comment, p.full_name AS approver_name, ap.decided_at
         FROM approvals ap LEFT JOIN profiles p ON p.id = ap.approver_id
        WHERE ap.booking_id = $1 ORDER BY ap.step`,
      [bookingId],
    );
    const room = await getRoomWith(sql, base.roomId);

    return {
      ...base,
      purpose: e.purpose,
      notes: e.notes,
      bookerEmail: e.booker_email,
      bookerDepartment: e.booker_department,
      roomCode: e.room_code,
      roomCapacity: e.room_capacity,
      createdAt: e.created_at,
      cancelReason: e.cancel_reason,
      canSeeDetails: e.can_see_details,
      attendees: attendees.rows.map((a) => ({
        email: a.email,
        displayName: a.display_name,
        kind: a.kind,
        response: a.response,
      })),
      resources: resources.rows.map((r) => ({ amenityCode: r.amenity_code, nameTh: r.name_th, quantity: r.quantity })),
      approvals: approvals.rows.map((a) => ({
        id: a.id,
        step: a.step,
        status: a.status,
        comment: a.comment,
        approverName: a.approver_name,
        decidedAt: a.decided_at,
      })),
      policy: room!.policy,
    };
  });
}

// ============================================================
// แก้ไข / ยกเลิก
// ============================================================
export type UpdateBookingInput = Partial<
  Pick<CreateBookingInput, 'title' | 'purpose' | 'notes' | 'dateISO' | 'startTime' | 'endTime' | 'attendeeCount' | 'privacy' | 'attendees' | 'resources'>
> & { expectedVersion: number };

export async function updateBooking(
  ctx: DbContext,
  actor: Actor,
  bookingId: string,
  input: UpdateBookingInput,
): Promise<BookingRecord> {
  const tz = timezoneOf();
  return withTx(ctx, async (sql) => {
    const before = await getBookingRecord(sql, bookingId);
    if (!before) throw new NotFoundError(t('error.notFound'));
    if (before.version !== input.expectedVersion) throw new ConflictError(t('error.versionConflict'));
    if (before.status === 'cancelled' || before.status === 'rejected') {
      throw new DomainError('การจองนี้ถูกยกเลิกหรือปฏิเสธไปแล้ว แก้ไขไม่ได้', 'invalid_state');
    }

    const room = await loadRoomOrThrow(sql, before.roomId);
    const dateISO = input.dateISO ?? toDateISO(before.startsAt, tz);
    const startsAt = input.startTime ? localDateTimeToUtc(dateISO, input.startTime, tz) : before.startsAt;
    const endsAt = input.endTime ? localDateTimeToUtc(dateISO, input.endTime, tz) : before.endsAt;
    const attendeeCount = input.attendeeCount ?? before.attendeeCount;

    const timeChanged = startsAt.getTime() !== before.startsAt.getTime() || endsAt.getTime() !== before.endsAt.getTime();
    if (timeChanged) {
      await assertBookable(sql, actor, room, startsAt, endsAt, { attendeeCount }, bookingId);
    }

    try {
      const res = await sql.query(
        `UPDATE bookings
            SET title = coalesce($2, title), purpose = $3, notes = $4,
                starts_at = $5, ends_at = $6, attendee_count = $7,
                privacy = coalesce($8, privacy), version = version + 1, updated_by = $9
          WHERE id = $1 AND version = $10`,
        [
          bookingId,
          input.title?.trim() ?? null,
          input.purpose ?? null,
          input.notes ?? null,
          startsAt,
          endsAt,
          attendeeCount,
          input.privacy ?? null,
          actor.profileId,
          input.expectedVersion,
        ],
      );
      if (res.rowCount === 0) throw new ConflictError(t('error.versionConflict'));
    } catch (error) {
      if (pgErrorCode(error) === PG_ERROR.exclusionViolation) {
        const range = blockedRange(room.policy, startsAt, endsAt);
        throw conflictError(await findConflict(sql, room.id, range.start, range.end, bookingId));
      }
      throw error;
    }

    let attendeeProfileIds: string[] | undefined;
    if (input.attendees) attendeeProfileIds = await syncAttendees(sql, bookingId, input.attendees);
    if (input.resources) await syncResources(sql, bookingId, input.resources);

    if (timeChanged) {
      // เวลาเปลี่ยน -> ยกเลิก reminder เดิมแล้วตั้งใหม่
      await cancelPendingJobs(sql, bookingId, ['booking.reminder']);
      await scheduleReminders(sql, bookingId, before.bookerProfileId, {
        title: input.title ?? before.title,
        startsAt,
        endsAt,
        roomName: room.name,
      });
    }

    const emails = await sql.query<{ email: string }>('SELECT email FROM booking_attendees WHERE booking_id = $1', [
      bookingId,
    ]);
    await notifyBookingEvent(
      sql,
      actor,
      {
        id: bookingId,
        title: input.title ?? before.title,
        startsAt,
        endsAt,
        roomName: room.name,
        bookerProfileId: before.bookerProfileId,
        bookerEmail: (await sql.query<{ booker_email: string }>('SELECT booker_email FROM bookings WHERE id = $1', [bookingId])).rows[0]!.booker_email,
        privacy: input.privacy ?? before.privacy,
      },
      'booking.updated',
      { attendeeProfileIds, attendeeEmails: emails.rows.map((r) => r.email) },
    );

    await writeAudit(sql, {
      actorProfileId: actor.profileId,
      actorEmail: actor.email,
      action: 'booking.update',
      resourceType: 'booking',
      resourceId: bookingId,
      before,
      after: { title: input.title ?? before.title, startsAt, endsAt, attendeeCount },
      ipHint: actor.ipHint,
      userAgent: actor.userAgent,
      correlationId: actor.correlationId,
    });

    return (await getBookingRecord(sql, bookingId))!;
  });
}

export async function cancelBooking(
  ctx: DbContext,
  actor: Actor,
  bookingId: string,
  reason: string | null,
  scope: 'this' | 'series' = 'this',
): Promise<{ cancelled: number }> {
  return withTx(ctx, async (sql) => {
    const booking = await getBookingRecord(sql, bookingId);
    if (!booking) throw new NotFoundError(t('error.notFound'));
    if (booking.status === 'cancelled') return { cancelled: 0 };

    const room = await loadRoomOrThrow(sql, booking.roomId);
    const isAdmin = actor.permissions.includes('booking:manage_all');
    if (!isAdmin) {
      const violation = canCancel(room.policy, booking.startsAt);
      if (violation) throw new ValidationError(violation.message, [violation]);
    }

    const ids =
      scope === 'series' && booking.seriesId
        ? (
            await sql.query<{ id: string }>(
              `SELECT id FROM bookings WHERE series_id = $1 AND starts_at >= now() AND status = ANY($2)`,
              [booking.seriesId, ACTIVE_STATUSES],
            )
          ).rows.map((r) => r.id)
        : [bookingId];

    for (const id of ids) {
      await sql.query(
        `UPDATE bookings SET status = 'cancelled', cancelled_at = now(), cancelled_by = $2,
                             cancel_reason = $3, version = version + 1
          WHERE id = $1 AND status <> 'cancelled'`,
        [id, actor.profileId, reason],
      );
      // ปิดคำขออนุมัติที่ค้างอยู่ — เป็นผลพลอยได้ของการยกเลิก ทำในสิทธิ์ระบบ
      await asService(sql, () =>
        sql.query(`UPDATE approvals SET status = 'rejected', decided_at = now() WHERE booking_id = $1 AND status = 'pending'`, [
          id,
        ]),
      );
      await cancelPendingJobs(sql, id);
    }

    const emails = await sql.query<{ email: string }>('SELECT email FROM booking_attendees WHERE booking_id = $1', [bookingId]);
    const bookerEmail = (
      await sql.query<{ booker_email: string }>('SELECT booker_email FROM bookings WHERE id = $1', [bookingId])
    ).rows[0]!.booker_email;
    await notifyBookingEvent(
      sql,
      actor,
      {
        id: bookingId,
        title: booking.title,
        startsAt: booking.startsAt,
        endsAt: booking.endsAt,
        roomName: room.name,
        bookerProfileId: booking.bookerProfileId,
        bookerEmail,
        privacy: booking.privacy,
      },
      'booking.cancelled',
      { attendeeEmails: emails.rows.map((r) => r.email), reason },
    );

    await writeAudit(sql, {
      actorProfileId: actor.profileId,
      actorEmail: actor.email,
      action: scope === 'series' ? 'booking.cancel_series' : 'booking.cancel',
      resourceType: 'booking',
      resourceId: bookingId,
      before: booking,
      after: { status: 'cancelled', reason, count: ids.length },
      ipHint: actor.ipHint,
      userAgent: actor.userAgent,
      correlationId: actor.correlationId,
    });

    // มีห้องว่างแล้ว -> เสนอให้คิวรอลำดับถัดไป
    await offerToWaitlist(sql, actor, room, booking.startsAt, booking.endsAt);

    return { cancelled: ids.length };
  });
}

// ============================================================
// เช็กอิน
// ============================================================
export async function checkInBooking(ctx: DbContext, actor: Actor, bookingId: string): Promise<BookingRecord> {
  return withTx(ctx, async (sql) => {
    const booking = await getBookingRecord(sql, bookingId);
    if (!booking) throw new NotFoundError(t('error.notFound'));
    if (booking.status !== 'confirmed') {
      throw new DomainError('เช็กอินได้เฉพาะการจองที่ยืนยันแล้ว', 'invalid_state');
    }
    const isSelf = booking.bookerProfileId === actor.profileId;
    if (!isSelf && !actor.permissions.includes('booking:check_in_any')) {
      throw new ForbiddenError(t('error.forbidden'));
    }
    const room = await loadRoomOrThrow(sql, booking.roomId);
    if (!isWithinCheckInWindow(room.policy, booking.startsAt)) {
      throw new DomainError(t('booking.checkInTooEarly'), 'outside_check_in_window');
    }

    await sql.query(
      `UPDATE bookings SET status = 'checked_in', checked_in_at = now(), checked_in_by = $2, version = version + 1
        WHERE id = $1`,
      [bookingId, actor.profileId],
    );
    await writeAudit(sql, {
      actorProfileId: actor.profileId,
      actorEmail: actor.email,
      action: 'booking.check_in',
      resourceType: 'booking',
      resourceId: bookingId,
      after: { checkedInAt: new Date() },
      correlationId: actor.correlationId,
    });
    return (await getBookingRecord(sql, bookingId))!;
  });
}

// ============================================================
// อนุมัติ / ปฏิเสธ
// ============================================================
export async function decideApproval(
  ctx: DbContext,
  actor: Actor,
  bookingId: string,
  decision: 'approved' | 'rejected' | 'info_requested',
  comment: string | null,
): Promise<BookingRecord> {
  if (decision === 'rejected' && !comment?.trim()) {
    throw new ValidationError(t('approval.rejectReasonRequired'), [
      { code: 'reason_required', field: 'general', message: t('approval.rejectReasonRequired') },
    ]);
  }
  return withTx(ctx, async (sql) => {
    const booking = await getBookingRecord(sql, bookingId);
    if (!booking) throw new NotFoundError(t('error.notFound'));
    if (booking.status !== 'pending') throw new DomainError('รายการนี้ไม่ได้อยู่ในสถานะรออนุมัติ', 'invalid_state');

    const room = await loadRoomOrThrow(sql, booking.roomId);
    const updated = await sql.query(
      `UPDATE approvals SET status = $3, comment = $4, decided_at = now(), approver_id = coalesce(approver_id, $2)
        WHERE booking_id = $1 AND status = 'pending'`,
      [bookingId, actor.profileId, decision, comment],
    );
    if (updated.rowCount === 0) throw new ForbiddenError(t('error.forbidden'));

    if (decision === 'approved') {
      try {
        await sql.query(`UPDATE bookings SET status = 'confirmed', version = version + 1 WHERE id = $1`, [bookingId]);
      } catch (error) {
        if (pgErrorCode(error) === PG_ERROR.exclusionViolation) {
          const range = blockedRange(room.policy, booking.startsAt, booking.endsAt);
          throw conflictError(await findConflict(sql, room.id, range.start, range.end, bookingId));
        }
        throw error;
      }
      await scheduleReminders(sql, bookingId, booking.bookerProfileId, {
        title: booking.title,
        startsAt: booking.startsAt,
        endsAt: booking.endsAt,
        roomName: room.name,
      });
    } else if (decision === 'rejected') {
      await sql.query(`UPDATE bookings SET status = 'rejected', version = version + 1 WHERE id = $1`, [bookingId]);
      await cancelPendingJobs(sql, bookingId);
    }

    const bookerEmail = (
      await sql.query<{ booker_email: string }>('SELECT booker_email FROM bookings WHERE id = $1', [bookingId])
    ).rows[0]!.booker_email;
    if (decision !== 'info_requested') {
      await notifyBookingEvent(
        sql,
        actor,
        {
          id: bookingId,
          title: booking.title,
          startsAt: booking.startsAt,
          endsAt: booking.endsAt,
          roomName: room.name,
          bookerProfileId: booking.bookerProfileId,
          bookerEmail,
          privacy: booking.privacy,
        },
        decision === 'approved' ? 'booking.approved' : 'booking.rejected',
        { reason: comment },
      );
    }

    await writeAudit(sql, {
      actorProfileId: actor.profileId,
      actorEmail: actor.email,
      action: `booking.${decision}`,
      resourceType: 'booking',
      resourceId: bookingId,
      before: { status: 'pending' },
      after: { status: decision, comment },
      ipHint: actor.ipHint,
      correlationId: actor.correlationId,
    });

    if (decision === 'rejected') {
      await offerToWaitlist(sql, actor, room, booking.startsAt, booking.endsAt);
    }

    return (await getBookingRecord(sql, bookingId))!;
  });
}

// ============================================================
// คิวรอห้องว่าง
// ============================================================
export async function joinWaitlist(
  ctx: DbContext,
  actor: Actor,
  input: { roomId: string; dateISO: string; startTime: string; endTime: string; title: string; attendeeCount: number },
): Promise<string> {
  const tz = timezoneOf();
  return withTx(ctx, async (sql) => {
    const room = await loadRoomOrThrow(sql, input.roomId);
    if (!room.policy.waitlistEnabled) throw new DomainError('ห้องนี้ไม่ได้เปิดใช้คิวรอ', 'waitlist_disabled');
    const res = await sql.query<{ id: string }>(
      `INSERT INTO waitlist_entries (room_id, profile_id, desired_start, desired_end, title, attendee_count)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [
        input.roomId,
        actor.profileId,
        localDateTimeToUtc(input.dateISO, input.startTime, tz),
        localDateTimeToUtc(input.dateISO, input.endTime, tz),
        input.title,
        input.attendeeCount,
      ],
    );
    return res.rows[0]!.id;
  });
}

/** เมื่อห้องว่างลง แจ้งคิวรอลำดับถัดไปพร้อมเวลาหมดอายุการยืนยัน (บรีฟข้อ 10) */
async function offerToWaitlist(sql: Sql, actor: Actor, room: Room, startsAt: Date, endsAt: Date): Promise<void> {
  if (!room.policy.waitlistEnabled) return;
  // คิวรอเป็นของผู้ใช้คนอื่น ผู้ที่กดยกเลิกจึงไม่มีสิทธิ์อ่าน/แก้ตาม RLS — ยกระดับเฉพาะงานนี้
  const res = await asService(sql, () =>
    sql.query<{ id: string; profile_id: string; title: string; desired_start: Date; desired_end: Date }>(
    `SELECT id, profile_id, title, desired_start, desired_end
       FROM waitlist_entries
      WHERE room_id = $1 AND status = 'waiting'
        AND tstzrange(desired_start, desired_end, '[)') && tstzrange($2, $3, '[)')
      ORDER BY created_at
      LIMIT 1`,
      [room.id, startsAt, endsAt],
    ),
  );
  const entry = res.rows[0];
  if (!entry) return;

  const offerMinutes = 30;
  const expiresAt = new Date(Date.now() + offerMinutes * 60_000);
  await asService(sql, () =>
    sql.query(`UPDATE waitlist_entries SET status = 'offered', offered_at = now(), offer_expires_at = $2 WHERE id = $1`, [
      entry.id,
      expiresAt,
    ]),
  );
  const when = `${formatThaiDate(toDateISO(entry.desired_start, timezoneOf()))} ${formatTimeRange(
    entry.desired_start,
    entry.desired_end,
    timezoneOf(),
  )}`;
  const payload = {
    subject: `มีห้องว่างแล้ว: ${room.name}`,
    text: `ช่วงเวลาที่คุณรออยู่ว่างแล้ว\n${when}\nกรุณายืนยันภายใน ${offerMinutes} นาที มิฉะนั้นระบบจะเสนอให้คิวถัดไป`,
    link: `/calendar?room=${room.id}&date=${toDateISO(entry.desired_start, timezoneOf())}`,
  };
  await enqueueNotification(sql, {
    eventType: 'waitlist.offer',
    channel: 'email',
    recipientProfileId: entry.profile_id,
    payload,
    correlationId: actor.correlationId ?? null,
  });
  await pushInApp(sql, {
    profileId: entry.profile_id,
    eventType: 'waitlist.offer',
    title: payload.subject,
    body: payload.text,
    link: payload.link,
  });
}
