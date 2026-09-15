import 'server-only';
import { withTx, type DbContext, type Sql } from '@/lib/db/pool';
import { DEFAULT_TZ, endOfLocalDay, localDateTimeToUtc, startOfLocalDay, toDateISO } from '@/lib/util/time';
import { listRoomsWith, mapRoom, type Room } from './rooms';

/**
 * ระบบค้นหา (บรีฟข้อ 4) — รองรับสามกรณีตามที่บรีฟกำหนด
 *   1. ค้นหาห้องประชุม   2. ค้นหาชื่อผู้จอง   3. ค้นหาช่วงเวลาว่าง
 * ผลค้นหาช่วงเวลาต้องถูกตรวจ conflict ฝั่ง server ซ้ำอีกครั้งก่อนยืนยันเสมอ
 */

function tz(): string {
  return process.env.APP_TIMEZONE || DEFAULT_TZ;
}

export type RoomSearchResult = Room & {
  nextFreeFrom: string | null;
  isFreeNow: boolean;
};

export type RoomSearchInput = {
  text?: string;
  capacity?: number | null;
  buildingId?: string | null;
  floor?: string | null;
  amenityCodes?: string[];
  limit?: number;
};

export async function searchRooms(ctx: DbContext, input: RoomSearchInput): Promise<RoomSearchResult[]> {
  return withTx(ctx, async (sql) => {
    const conditions: string[] = ['r.archived_at IS NULL', 'r.is_active'];
    const values: unknown[] = [];

    if (input.text?.trim()) {
      values.push(`%${input.text.trim()}%`);
      conditions.push(
        `(r.name ILIKE $${values.length} OR r.code ILIKE $${values.length} OR r.description ILIKE $${values.length}
          OR r.floor ILIKE $${values.length} OR b.name ILIKE $${values.length})`,
      );
    }
    if (input.capacity) {
      values.push(input.capacity);
      conditions.push(`r.capacity >= $${values.length}`);
    }
    if (input.buildingId) {
      values.push(input.buildingId);
      conditions.push(`r.building_id = $${values.length}`);
    }
    if (input.floor) {
      values.push(input.floor);
      conditions.push(`r.floor = $${values.length}`);
    }
    if (input.amenityCodes?.length) {
      values.push(input.amenityCodes);
      conditions.push(
        `(SELECT count(*) FROM room_amenities ra WHERE ra.room_id = r.id AND ra.amenity_code = ANY($${values.length}))
          = array_length($${values.length}::text[], 1)`,
      );
    }
    values.push(input.limit ?? 30);

    const res = await sql.query<Parameters<typeof mapRoom>[0] & { next_free_from: Date | null }>(
      `SELECT r.id, r.organization_id, r.code, r.name, r.description, r.floor, r.location_hint,
              r.capacity, r.room_type, r.photos, r.color, r.building_id, b.name AS building_name,
              to_char(r.open_time, 'HH24:MI') AS open_time, to_char(r.close_time, 'HH24:MI') AS close_time,
              r.open_days, r.slot_step_minutes, r.min_duration_minutes, r.max_duration_minutes,
              r.buffer_before_minutes, r.buffer_after_minutes, r.booking_horizon_days,
              r.cancel_window_minutes, r.requires_approval, r.check_in_required,
              r.check_in_grace_minutes, r.waitlist_enabled, r.sort_order, r.is_active, r.archived_at,
              (SELECT coalesce(json_agg(json_build_object(
                        'code', a.code, 'nameTh', a.name_th, 'nameEn', a.name_en, 'icon', a.icon)
                        ORDER BY a.sort_order), '[]'::json)
                 FROM room_amenities ra JOIN amenities a ON a.code = ra.amenity_code
                WHERE ra.room_id = r.id) AS amenities,
              (SELECT max(bk.ends_at) FROM bookings bk
                WHERE bk.room_id = r.id AND bk.blocks_slot
                  AND bk.blocked_period @> now()) AS next_free_from
         FROM rooms r
         LEFT JOIN buildings b ON b.id = r.building_id
        WHERE ${conditions.join(' AND ')}
        ORDER BY r.capacity, r.sort_order, r.name
        LIMIT $${values.length}`,
      values,
    );

    return res.rows.map((row) => ({
      ...mapRoom(row),
      nextFreeFrom: row.next_free_from ? row.next_free_from.toISOString() : null,
      isFreeNow: row.next_free_from === null,
    }));
  });
}

export type BookingSearchResult = {
  id: string;
  roomId: string;
  roomName: string;
  title: string;
  startsAt: string;
  endsAt: string;
  status: string;
  bookerName: string | null;
  bookerDepartment: string | null;
  canSeeDetails: boolean;
};

/**
 * ค้นหาตามชื่อผู้จอง/ทีม/อีเมล
 * ความปลอดภัย: query ผ่าน view ที่ปิดบังข้อมูล และ RLS ตัดแถวที่ไม่มีสิทธิ์ออกให้อยู่แล้ว
 * ผู้ใช้ทั่วไปจึงไม่เห็นรายละเอียดของการประชุมส่วนตัวของผู้อื่น
 */
export async function searchBookings(
  ctx: DbContext,
  input: { text: string; fromISO?: string | null; toISO?: string | null; roomId?: string | null; limit?: number },
): Promise<BookingSearchResult[]> {
  return withTx(ctx, async (sql) => {
    const values: unknown[] = [`%${input.text.trim()}%`];
    const conditions = [
      `(b.booker_name ILIKE $1 OR b.booker_email ILIKE $1 OR b.booker_department ILIKE $1 OR v.title ILIKE $1)`,
      `v.status NOT IN ('cancelled','rejected')`,
    ];
    if (input.fromISO) {
      values.push(startOfLocalDay(input.fromISO, tz()));
      conditions.push(`v.ends_at >= $${values.length}`);
    }
    if (input.toISO) {
      values.push(endOfLocalDay(input.toISO, tz()));
      conditions.push(`v.starts_at <= $${values.length}`);
    }
    if (input.roomId) {
      values.push(input.roomId);
      conditions.push(`v.room_id = $${values.length}`);
    }
    values.push(input.limit ?? 50);

    const res = await sql.query<{
      id: string;
      room_id: string;
      room_name: string;
      title: string;
      starts_at: Date;
      ends_at: Date;
      status: string;
      booker_name: string | null;
      booker_department: string | null;
      can_see_details: boolean;
    }>(
      `SELECT v.id, v.room_id, r.name AS room_name, v.title, v.starts_at, v.ends_at, v.status,
              v.booker_name, v.booker_department, v.can_see_details
         FROM app.v_calendar_bookings v
         JOIN bookings b ON b.id = v.id
         JOIN rooms r ON r.id = v.room_id
        WHERE ${conditions.join(' AND ')}
        ORDER BY v.starts_at DESC
        LIMIT $${values.length}`,
      values,
    );

    return res.rows.map((r) => ({
      id: r.id,
      roomId: r.room_id,
      roomName: r.room_name,
      title: r.title,
      startsAt: r.starts_at.toISOString(),
      endsAt: r.ends_at.toISOString(),
      status: r.status,
      bookerName: r.booker_name,
      bookerDepartment: r.booker_department,
      canSeeDetails: r.can_see_details,
    }));
  });
}

export type FreeSlotResult = {
  room: Room;
  /** คะแนนความเหมาะสม: ห้องที่ความจุใกล้จำนวนคนที่ต้องการที่สุดได้คะแนนดีที่สุด */
  fitScore: number;
  matchedAmenities: string[];
};

/** ค้นหาห้องที่ว่างจริงในช่วงเวลาที่ระบุ เรียงตามความเหมาะสม */
export async function searchFreeSlots(
  ctx: DbContext,
  input: {
    dateISO: string;
    startTime: string;
    endTime: string;
    capacity?: number | null;
    amenityCodes?: string[];
    buildingId?: string | null;
    limit?: number;
  },
): Promise<FreeSlotResult[]> {
  const startsAt = localDateTimeToUtc(input.dateISO, input.startTime, tz());
  const endsAt = localDateTimeToUtc(input.dateISO, input.endTime, tz());

  return withTx(ctx, async (sql) => {
    const rooms = await listRoomsWith(sql);
    const free: FreeSlotResult[] = [];

    for (const room of rooms) {
      if (input.capacity && room.capacity < input.capacity) continue;
      if (input.buildingId && room.buildingId !== input.buildingId) continue;
      const roomAmenities = new Set(room.amenities.map((a) => a.code));
      const wanted = input.amenityCodes ?? [];
      if (wanted.some((code) => !roomAmenities.has(code))) continue;

      const blockedStart = new Date(startsAt.getTime() - room.policy.bufferBeforeMinutes * 60_000);
      const blockedEnd = new Date(endsAt.getTime() + room.policy.bufferAfterMinutes * 60_000);

      const busy = await sql.query<{ exists: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM bookings b
            WHERE b.room_id = $1 AND b.blocks_slot AND b.blocked_period && tstzrange($2, $3, '[)')
           UNION ALL
           SELECT 1 FROM room_closures c
            WHERE c.room_id = $1 AND tstzrange(c.starts_at, c.ends_at, '[)') && tstzrange($2, $3, '[)')
         ) AS exists`,
        [room.id, blockedStart, blockedEnd],
      );
      if (busy.rows[0]?.exists) continue;

      free.push({
        room,
        fitScore: input.capacity ? room.capacity - input.capacity : room.capacity,
        matchedAmenities: wanted.filter((c) => roomAmenities.has(c)),
      });
    }

    return free.sort((a, b) => a.fitScore - b.fitScore).slice(0, input.limit ?? 20);
  });
}

/** การจองของฉัน — ใช้ในหน้า "การจองของฉัน" และหน้าแรกหลังล็อกอิน */
export async function listMyBookings(
  ctx: DbContext,
  profileId: string,
  opts: { upcomingOnly?: boolean; limit?: number } = {},
): Promise<BookingSearchResult[]> {
  return withTx(ctx, async (sql: Sql) => {
    const res = await sql.query<{
      id: string;
      room_id: string;
      room_name: string;
      title: string;
      starts_at: Date;
      ends_at: Date;
      status: string;
      booker_name: string | null;
      booker_department: string | null;
    }>(
      `SELECT b.id, b.room_id, r.name AS room_name, b.title, b.starts_at, b.ends_at, b.status,
              b.booker_name, b.booker_department
         FROM bookings b JOIN rooms r ON r.id = b.room_id
        WHERE (b.booker_profile_id = $1 OR $1 = ANY(b.attendee_profile_ids))
          AND b.status <> 'draft'
          ${opts.upcomingOnly ? "AND b.ends_at >= now() AND b.status NOT IN ('cancelled','rejected')" : ''}
        ORDER BY b.starts_at ${opts.upcomingOnly ? 'ASC' : 'DESC'}
        LIMIT $2`,
      [profileId, opts.limit ?? 50],
    );
    return res.rows.map((r) => ({
      id: r.id,
      roomId: r.room_id,
      roomName: r.room_name,
      title: r.title,
      startsAt: r.starts_at.toISOString(),
      endsAt: r.ends_at.toISOString(),
      status: r.status,
      bookerName: r.booker_name,
      bookerDepartment: r.booker_department,
      canSeeDetails: true,
    }));
  });
}

/** คิวรออนุมัติของผู้อนุมัติคนปัจจุบัน */
export async function listPendingApprovals(ctx: DbContext): Promise<
  (BookingSearchResult & { approvalId: string; attendeeCount: number; purpose: string | null })[]
> {
  return withTx(ctx, async (sql) => {
    const res = await sql.query<{
      approval_id: string;
      id: string;
      room_id: string;
      room_name: string;
      title: string;
      starts_at: Date;
      ends_at: Date;
      status: string;
      booker_name: string;
      booker_department: string | null;
      attendee_count: number;
      purpose: string | null;
    }>(
      `SELECT ap.id AS approval_id, b.id, b.room_id, r.name AS room_name, b.title,
              b.starts_at, b.ends_at, b.status, b.booker_name, b.booker_department,
              b.attendee_count, b.purpose
         FROM approvals ap
         JOIN bookings b ON b.id = ap.booking_id
         JOIN rooms r ON r.id = b.room_id
        WHERE ap.status = 'pending' AND b.status = 'pending'
        ORDER BY b.starts_at`,
    );
    return res.rows.map((r) => ({
      approvalId: r.approval_id,
      id: r.id,
      roomId: r.room_id,
      roomName: r.room_name,
      title: r.title,
      startsAt: r.starts_at.toISOString(),
      endsAt: r.ends_at.toISOString(),
      status: r.status,
      bookerName: r.booker_name,
      bookerDepartment: r.booker_department,
      attendeeCount: r.attendee_count,
      purpose: r.purpose,
      canSeeDetails: true,
    }));
  });
}
