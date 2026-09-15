import 'server-only';
import type { DbContext, Sql } from '@/lib/db/pool';
import { withTx } from '@/lib/db/pool';
import { writeAudit } from '@/lib/audit';
import type { RoomPolicy } from './booking-rules';

export type Amenity = { code: string; nameTh: string; nameEn: string; icon: string };

export type Room = {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  description: string | null;
  floor: string | null;
  locationHint: string | null;
  capacity: number;
  roomType: string;
  photos: string[];
  color: string;
  buildingId: string | null;
  buildingName: string | null;
  amenities: Amenity[];
  sortOrder: number;
  isActive: boolean;
  archivedAt: Date | null;
  policy: RoomPolicy;
};

type RoomRow = {
  id: string;
  organization_id: string;
  code: string;
  name: string;
  description: string | null;
  floor: string | null;
  location_hint: string | null;
  capacity: number;
  room_type: string;
  photos: unknown;
  color: string;
  building_id: string | null;
  building_name: string | null;
  open_time: string;
  close_time: string;
  open_days: number[];
  slot_step_minutes: number;
  min_duration_minutes: number;
  max_duration_minutes: number;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  booking_horizon_days: number;
  cancel_window_minutes: number;
  requires_approval: boolean;
  check_in_required: boolean;
  check_in_grace_minutes: number;
  waitlist_enabled: boolean;
  sort_order: number;
  is_active: boolean;
  archived_at: Date | null;
  amenities: Amenity[] | null;
};

const ROOM_SELECT = `
  SELECT r.id, r.organization_id, r.code, r.name, r.description, r.floor, r.location_hint,
         r.capacity, r.room_type, r.photos, r.color, r.building_id, b.name AS building_name,
         to_char(r.open_time, 'HH24:MI') AS open_time,
         to_char(r.close_time, 'HH24:MI') AS close_time,
         r.open_days, r.slot_step_minutes, r.min_duration_minutes, r.max_duration_minutes,
         r.buffer_before_minutes, r.buffer_after_minutes, r.booking_horizon_days,
         r.cancel_window_minutes, r.requires_approval, r.check_in_required,
         r.check_in_grace_minutes, r.waitlist_enabled, r.sort_order, r.is_active, r.archived_at,
         (SELECT coalesce(json_agg(json_build_object(
                   'code', a.code, 'nameTh', a.name_th, 'nameEn', a.name_en, 'icon', a.icon)
                   ORDER BY a.sort_order), '[]'::json)
            FROM room_amenities ra JOIN amenities a ON a.code = ra.amenity_code
           WHERE ra.room_id = r.id) AS amenities
    FROM rooms r
    LEFT JOIN buildings b ON b.id = r.building_id`;

export function mapRoom(row: RoomRow): Room {
  return {
    id: row.id,
    organizationId: row.organization_id,
    code: row.code,
    name: row.name,
    description: row.description,
    floor: row.floor,
    locationHint: row.location_hint,
    capacity: row.capacity,
    roomType: row.room_type,
    photos: Array.isArray(row.photos) ? (row.photos as string[]) : [],
    color: row.color,
    buildingId: row.building_id,
    buildingName: row.building_name,
    amenities: row.amenities ?? [],
    sortOrder: row.sort_order,
    isActive: row.is_active,
    archivedAt: row.archived_at,
    policy: {
      id: row.id,
      name: row.name,
      capacity: row.capacity,
      openTime: row.open_time,
      closeTime: row.close_time,
      openDays: row.open_days,
      slotStepMinutes: row.slot_step_minutes,
      minDurationMinutes: row.min_duration_minutes,
      maxDurationMinutes: row.max_duration_minutes,
      bufferBeforeMinutes: row.buffer_before_minutes,
      bufferAfterMinutes: row.buffer_after_minutes,
      bookingHorizonDays: row.booking_horizon_days,
      cancelWindowMinutes: row.cancel_window_minutes,
      requiresApproval: row.requires_approval,
      checkInRequired: row.check_in_required,
      checkInGraceMinutes: row.check_in_grace_minutes,
      waitlistEnabled: row.waitlist_enabled,
      isActive: row.is_active && row.archived_at === null,
    },
  };
}

export async function listRoomsWith(sql: Sql, opts: { includeArchived?: boolean; includeInactive?: boolean } = {}) {
  const conditions: string[] = [];
  if (!opts.includeArchived) conditions.push('r.archived_at IS NULL');
  if (!opts.includeInactive) conditions.push('r.is_active');
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const res = await sql.query<RoomRow>(`${ROOM_SELECT} ${where} ORDER BY r.sort_order, r.name`);
  return res.rows.map(mapRoom);
}

export function listRooms(ctx: DbContext, opts: { includeArchived?: boolean; includeInactive?: boolean } = {}) {
  return withTx(ctx, (sql) => listRoomsWith(sql, opts));
}

export async function getRoomWith(sql: Sql, roomId: string): Promise<Room | null> {
  const res = await sql.query<RoomRow>(`${ROOM_SELECT} WHERE r.id = $1`, [roomId]);
  const row = res.rows[0];
  return row ? mapRoom(row) : null;
}

export function getRoom(ctx: DbContext, roomId: string): Promise<Room | null> {
  return withTx(ctx, (sql) => getRoomWith(sql, roomId));
}

export type RoomInput = {
  code: string;
  name: string;
  description?: string | null;
  floor?: string | null;
  locationHint?: string | null;
  capacity: number;
  roomType: string;
  buildingId?: string | null;
  color?: string;
  photos?: string[];
  amenityCodes?: string[];
  openTime: string;
  closeTime: string;
  openDays: number[];
  slotStepMinutes: number;
  minDurationMinutes: number;
  maxDurationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  bookingHorizonDays: number;
  cancelWindowMinutes: number;
  requiresApproval: boolean;
  checkInRequired: boolean;
  checkInGraceMinutes: number;
  waitlistEnabled: boolean;
  sortOrder?: number;
  isActive?: boolean;
  approverProfileIds?: string[];
};

const ROOM_WRITE_COLUMNS = [
  'code',
  'name',
  'description',
  'floor',
  'location_hint',
  'capacity',
  'room_type',
  'building_id',
  'color',
  'photos',
  'open_time',
  'close_time',
  'open_days',
  'slot_step_minutes',
  'min_duration_minutes',
  'max_duration_minutes',
  'buffer_before_minutes',
  'buffer_after_minutes',
  'booking_horizon_days',
  'cancel_window_minutes',
  'requires_approval',
  'check_in_required',
  'check_in_grace_minutes',
  'waitlist_enabled',
  'sort_order',
  'is_active',
];

function roomValues(input: RoomInput): unknown[] {
  return [
    input.code.trim(),
    input.name.trim(),
    input.description ?? null,
    input.floor ?? null,
    input.locationHint ?? null,
    input.capacity,
    input.roomType,
    input.buildingId ?? null,
    input.color ?? '#EC5F27',
    JSON.stringify(input.photos ?? []),
    input.openTime,
    input.closeTime,
    input.openDays,
    input.slotStepMinutes,
    input.minDurationMinutes,
    input.maxDurationMinutes,
    input.bufferBeforeMinutes,
    input.bufferAfterMinutes,
    input.bookingHorizonDays,
    input.cancelWindowMinutes,
    input.requiresApproval,
    input.checkInRequired,
    input.checkInGraceMinutes,
    input.waitlistEnabled,
    input.sortOrder ?? 100,
    input.isActive ?? true,
  ];
}

async function syncRoomRelations(sql: Sql, roomId: string, input: RoomInput) {
  if (input.amenityCodes) {
    await sql.query('DELETE FROM room_amenities WHERE room_id = $1', [roomId]);
    for (const code of input.amenityCodes) {
      await sql.query('INSERT INTO room_amenities (room_id, amenity_code) VALUES ($1,$2)', [roomId, code]);
    }
  }
  if (input.approverProfileIds) {
    await sql.query('DELETE FROM room_approvers WHERE room_id = $1', [roomId]);
    for (const profileId of input.approverProfileIds) {
      await sql.query('INSERT INTO room_approvers (room_id, profile_id) VALUES ($1,$2)', [roomId, profileId]);
    }
  }
}

/** เพิ่มห้องใหม่ — ห้องจะโผล่ใน dropdown, search และปฏิทินทันทีโดยไม่ต้องแก้โค้ด (AC06) */
export async function createRoom(
  ctx: DbContext,
  organizationId: string,
  input: RoomInput,
  actor: { profileId: string; email: string; ipHint?: string | null; userAgent?: string | null },
): Promise<Room> {
  return withTx(ctx, async (sql) => {
    const placeholders = ROOM_WRITE_COLUMNS.map((_, i) => `$${i + 2}`).join(', ');
    const res = await sql.query<{ id: string }>(
      `INSERT INTO rooms (organization_id, ${ROOM_WRITE_COLUMNS.join(', ')})
       VALUES ($1, ${placeholders}) RETURNING id`,
      [organizationId, ...roomValues(input)],
    );
    const roomId = res.rows[0]!.id;
    await syncRoomRelations(sql, roomId, input);
    await writeAudit(sql, {
      actorProfileId: actor.profileId,
      actorEmail: actor.email,
      action: 'room.create',
      resourceType: 'room',
      resourceId: roomId,
      after: input,
      ipHint: actor.ipHint,
      userAgent: actor.userAgent,
    });
    const room = await getRoomWith(sql, roomId);
    return room!;
  });
}

export async function updateRoom(
  ctx: DbContext,
  roomId: string,
  input: RoomInput,
  actor: { profileId: string; email: string; ipHint?: string | null; userAgent?: string | null },
): Promise<Room> {
  return withTx(ctx, async (sql) => {
    const before = await getRoomWith(sql, roomId);
    if (!before) throw new Error('ไม่พบห้องที่ต้องการแก้ไข');
    const setClause = ROOM_WRITE_COLUMNS.map((col, i) => `${col} = $${i + 2}`).join(', ');
    const res = await sql.query(`UPDATE rooms SET ${setClause} WHERE id = $1`, [roomId, ...roomValues(input)]);
    if (res.rowCount === 0) throw new Error('ไม่มีสิทธิ์แก้ไขห้องนี้');
    await syncRoomRelations(sql, roomId, input);
    await writeAudit(sql, {
      actorProfileId: actor.profileId,
      actorEmail: actor.email,
      action: 'room.update',
      resourceType: 'room',
      resourceId: roomId,
      before,
      after: input,
      ipHint: actor.ipHint,
      userAgent: actor.userAgent,
    });
    const room = await getRoomWith(sql, roomId);
    return room!;
  });
}

/**
 * ห้ามลบห้องที่มีประวัติการจอง ให้ Archive แทน เพื่อรักษารายงานและ audit trail
 * (บรีฟข้อ 9)
 */
export async function archiveRoom(
  ctx: DbContext,
  roomId: string,
  actor: { profileId: string; email: string },
): Promise<void> {
  await withTx(ctx, async (sql) => {
    await sql.query(`UPDATE rooms SET archived_at = now(), is_active = false WHERE id = $1`, [roomId]);
    await writeAudit(sql, {
      actorProfileId: actor.profileId,
      actorEmail: actor.email,
      action: 'room.archive',
      resourceType: 'room',
      resourceId: roomId,
    });
  });
}

export async function restoreRoom(
  ctx: DbContext,
  roomId: string,
  actor: { profileId: string; email: string },
): Promise<void> {
  await withTx(ctx, async (sql) => {
    await sql.query(`UPDATE rooms SET archived_at = NULL, is_active = true WHERE id = $1`, [roomId]);
    await writeAudit(sql, {
      actorProfileId: actor.profileId,
      actorEmail: actor.email,
      action: 'room.restore',
      resourceType: 'room',
      resourceId: roomId,
    });
  });
}

export async function listAmenities(ctx: DbContext): Promise<Amenity[]> {
  return withTx(ctx, async (sql) => {
    const res = await sql.query<{ code: string; name_th: string; name_en: string; icon: string }>(
      'SELECT code, name_th, name_en, icon FROM amenities ORDER BY sort_order',
    );
    return res.rows.map((r) => ({ code: r.code, nameTh: r.name_th, nameEn: r.name_en, icon: r.icon }));
  });
}

export async function listBuildings(ctx: DbContext) {
  return withTx(ctx, async (sql) => {
    const res = await sql.query<{ id: string; name: string; code: string }>(
      'SELECT id, name, code FROM buildings WHERE is_active ORDER BY sort_order, name',
    );
    return res.rows;
  });
}

/** ช่วงปิดปรับปรุงที่ทับกับช่วงเวลาที่ขอ */
export async function findClosureConflict(
  sql: Sql,
  roomId: string,
  startsAt: Date,
  endsAt: Date,
): Promise<{ reason: string; starts_at: Date; ends_at: Date } | null> {
  const res = await sql.query<{ reason: string; starts_at: Date; ends_at: Date }>(
    `SELECT reason, starts_at, ends_at FROM room_closures
      WHERE room_id = $1 AND tstzrange(starts_at, ends_at, '[)') && tstzrange($2, $3, '[)')
      LIMIT 1`,
    [roomId, startsAt, endsAt],
  );
  return res.rows[0] ?? null;
}

/** วันหยุดที่ปิดการจอง ในช่วงวันที่ที่สนใจ */
export async function blockedHolidayDates(
  sql: Sql,
  organizationId: string,
  roomId: string | null,
  fromISO: string,
  toISO: string,
): Promise<string[]> {
  const res = await sql.query<{ holiday_date: string }>(
    `SELECT to_char(holiday_date, 'YYYY-MM-DD') AS holiday_date
       FROM holidays
      WHERE organization_id = $1
        AND blocks_booking
        AND (room_id IS NULL OR room_id = $2)
        AND holiday_date BETWEEN $3::date AND $4::date`,
    [organizationId, roomId, fromISO, toISO],
  );
  return res.rows.map((r) => r.holiday_date);
}
