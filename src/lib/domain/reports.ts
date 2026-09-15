import 'server-only';
import { withTx, type DbContext } from '@/lib/db/pool';
import { startOfLocalDay, endOfLocalDay, DEFAULT_TZ } from '@/lib/util/time';

/**
 * รายงานและ Dashboard (บรีฟข้อ 11)
 * ทุก query ผ่าน RLS จึงเห็นเฉพาะข้อมูลที่ผู้ใช้มีสิทธิ์
 */
function tz(): string {
  return process.env.APP_TIMEZONE || DEFAULT_TZ;
}

export type ReportFilter = {
  fromISO: string;
  toISO: string;
  roomId?: string | null;
  buildingId?: string | null;
  department?: string | null;
};

export type DashboardSummary = {
  totalBookings: number;
  confirmedBookings: number;
  cancelledBookings: number;
  noShowBookings: number;
  pendingApprovals: number;
  totalHours: number;
  utilizationPercent: number;
  peakHour: number | null;
  topRooms: { roomId: string; roomName: string; bookings: number; hours: number }[];
  byDepartment: { department: string; bookings: number }[];
  byDay: { dateISO: string; bookings: number; hours: number }[];
};

export async function getDashboard(ctx: DbContext, filter: ReportFilter): Promise<DashboardSummary> {
  const from = startOfLocalDay(filter.fromISO, tz());
  const to = endOfLocalDay(filter.toISO, tz());

  return withTx(ctx, async (sql) => {
    const params: unknown[] = [from, to];
    let roomClause = '';
    if (filter.roomId) {
      params.push(filter.roomId);
      roomClause += ` AND b.room_id = $${params.length}`;
    }
    if (filter.buildingId) {
      params.push(filter.buildingId);
      roomClause += ` AND r.building_id = $${params.length}`;
    }
    if (filter.department) {
      params.push(filter.department);
      roomClause += ` AND b.booker_department = $${params.length}`;
    }

    const totals = await sql.query<{
      total: string;
      confirmed: string;
      cancelled: string;
      no_show: string;
      pending: string;
      hours: string;
    }>(
      `SELECT count(*)::text AS total,
              count(*) FILTER (WHERE b.status IN ('confirmed','checked_in','completed'))::text AS confirmed,
              count(*) FILTER (WHERE b.status = 'cancelled')::text AS cancelled,
              count(*) FILTER (WHERE b.status = 'no_show')::text AS no_show,
              count(*) FILTER (WHERE b.status = 'pending')::text AS pending,
              coalesce(sum(EXTRACT(EPOCH FROM (b.ends_at - b.starts_at)) / 3600)
                       FILTER (WHERE b.status IN ('confirmed','checked_in','completed')), 0)::text AS hours
         FROM bookings b JOIN rooms r ON r.id = b.room_id
        WHERE b.starts_at >= $1 AND b.starts_at < $2 ${roomClause}`,
      params,
    );
    const row = totals.rows[0]!;

    const capacityRes = await sql.query<{ open_hours: string; room_count: string }>(
      `SELECT coalesce(sum(EXTRACT(EPOCH FROM (close_time - open_time)) / 3600), 0)::text AS open_hours,
              count(*)::text AS room_count
         FROM rooms r
        WHERE r.archived_at IS NULL AND r.is_active
          ${filter.roomId ? 'AND r.id = $1' : ''}`,
      filter.roomId ? [filter.roomId] : [],
    );
    const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / (24 * 3600_000)));
    const capacityHours = Number(capacityRes.rows[0]?.open_hours ?? 0) * days;
    const usedHours = Number(row.hours);

    const peak = await sql.query<{ hour: number; count: string }>(
      `SELECT EXTRACT(HOUR FROM b.starts_at AT TIME ZONE $3)::int AS hour, count(*)::text AS count
         FROM bookings b JOIN rooms r ON r.id = b.room_id
        WHERE b.starts_at >= $1 AND b.starts_at < $2
          AND b.status IN ('confirmed','checked_in','completed')
        GROUP BY 1 ORDER BY count(*) DESC LIMIT 1`,
      [from, to, tz()],
    );

    const topRooms = await sql.query<{ room_id: string; room_name: string; bookings: string; hours: string }>(
      `SELECT b.room_id, r.name AS room_name, count(*)::text AS bookings,
              coalesce(sum(EXTRACT(EPOCH FROM (b.ends_at - b.starts_at)) / 3600), 0)::text AS hours
         FROM bookings b JOIN rooms r ON r.id = b.room_id
        WHERE b.starts_at >= $1 AND b.starts_at < $2
          AND b.status IN ('confirmed','checked_in','completed')
        GROUP BY b.room_id, r.name ORDER BY count(*) DESC LIMIT 5`,
      [from, to],
    );

    const byDepartment = await sql.query<{ department: string | null; bookings: string }>(
      `SELECT coalesce(b.booker_department, 'ไม่ระบุแผนก') AS department, count(*)::text AS bookings
         FROM bookings b
        WHERE b.starts_at >= $1 AND b.starts_at < $2 AND b.status <> 'draft'
        GROUP BY 1 ORDER BY count(*) DESC LIMIT 10`,
      [from, to],
    );

    const byDay = await sql.query<{ date_iso: string; bookings: string; hours: string }>(
      `SELECT to_char(b.starts_at AT TIME ZONE $3, 'YYYY-MM-DD') AS date_iso,
              count(*)::text AS bookings,
              coalesce(sum(EXTRACT(EPOCH FROM (b.ends_at - b.starts_at)) / 3600), 0)::text AS hours
         FROM bookings b
        WHERE b.starts_at >= $1 AND b.starts_at < $2 AND b.status <> 'draft'
        GROUP BY 1 ORDER BY 1`,
      [from, to, tz()],
    );

    return {
      totalBookings: Number(row.total),
      confirmedBookings: Number(row.confirmed),
      cancelledBookings: Number(row.cancelled),
      noShowBookings: Number(row.no_show),
      pendingApprovals: Number(row.pending),
      totalHours: Math.round(usedHours * 10) / 10,
      utilizationPercent: capacityHours > 0 ? Math.round((usedHours / capacityHours) * 1000) / 10 : 0,
      peakHour: peak.rows[0] ? peak.rows[0].hour : null,
      topRooms: topRooms.rows.map((r) => ({
        roomId: r.room_id,
        roomName: r.room_name,
        bookings: Number(r.bookings),
        hours: Math.round(Number(r.hours) * 10) / 10,
      })),
      byDepartment: byDepartment.rows.map((r) => ({ department: r.department ?? '-', bookings: Number(r.bookings) })),
      byDay: byDay.rows.map((r) => ({
        dateISO: r.date_iso,
        bookings: Number(r.bookings),
        hours: Math.round(Number(r.hours) * 10) / 10,
      })),
    };
  });
}

export type BookingReportRow = {
  id: string;
  roomName: string;
  title: string;
  startsAt: string;
  endsAt: string;
  hours: number;
  status: string;
  bookerName: string;
  department: string | null;
  attendeeCount: number;
  checkedIn: boolean;
};

export async function getBookingReport(ctx: DbContext, filter: ReportFilter): Promise<BookingReportRow[]> {
  const from = startOfLocalDay(filter.fromISO, tz());
  const to = endOfLocalDay(filter.toISO, tz());
  return withTx(ctx, async (sql) => {
    const res = await sql.query<{
      id: string;
      room_name: string;
      title: string;
      starts_at: Date;
      ends_at: Date;
      status: string;
      booker_name: string;
      booker_department: string | null;
      attendee_count: number;
      checked_in_at: Date | null;
    }>(
      `SELECT b.id, r.name AS room_name, b.title, b.starts_at, b.ends_at, b.status,
              b.booker_name, b.booker_department, b.attendee_count, b.checked_in_at
         FROM bookings b JOIN rooms r ON r.id = b.room_id
        WHERE b.starts_at >= $1 AND b.starts_at < $2
          AND ($3::uuid IS NULL OR b.room_id = $3::uuid)
        ORDER BY b.starts_at DESC
        LIMIT 5000`,
      [from, to, filter.roomId ?? null],
    );
    return res.rows.map((r) => ({
      id: r.id,
      roomName: r.room_name,
      title: r.title,
      startsAt: r.starts_at.toISOString(),
      endsAt: r.ends_at.toISOString(),
      hours: Math.round(((r.ends_at.getTime() - r.starts_at.getTime()) / 3600_000) * 100) / 100,
      status: r.status,
      bookerName: r.booker_name,
      department: r.booker_department,
      attendeeCount: r.attendee_count,
      checkedIn: r.checked_in_at !== null,
    }));
  });
}

/** แปลงตารางเป็น CSV (มี BOM เพื่อให้ Excel ภาษาไทยเปิดแล้วไม่เพี้ยน) */
export function toCsv(rows: readonly Record<string, unknown>[], headers: { key: string; label: string }[]): string {
  const escape = (value: unknown): string => {
    const text = value === null || value === undefined ? '' : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [headers.map((h) => escape(h.label)).join(',')];
  for (const row of rows) lines.push(headers.map((h) => escape(row[h.key])).join(','));
  return `﻿${lines.join('\r\n')}`;
}

export type AuditLogRow = {
  id: string;
  actorEmail: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  createdAt: string;
  ipHint: string | null;
  correlationId: string | null;
  before: unknown;
  after: unknown;
};

export async function searchAuditLogs(
  ctx: DbContext,
  filter: { actor?: string | null; action?: string | null; resourceId?: string | null; fromISO?: string | null; toISO?: string | null; limit?: number },
): Promise<AuditLogRow[]> {
  return withTx(ctx, async (sql) => {
    const values: unknown[] = [];
    const conditions: string[] = [];
    if (filter.actor) {
      values.push(`%${filter.actor}%`);
      conditions.push(`actor_email ILIKE $${values.length}`);
    }
    if (filter.action) {
      values.push(`%${filter.action}%`);
      conditions.push(`action ILIKE $${values.length}`);
    }
    if (filter.resourceId) {
      values.push(filter.resourceId);
      conditions.push(`resource_id = $${values.length}`);
    }
    if (filter.fromISO) {
      values.push(startOfLocalDay(filter.fromISO, tz()));
      conditions.push(`created_at >= $${values.length}`);
    }
    if (filter.toISO) {
      values.push(endOfLocalDay(filter.toISO, tz()));
      conditions.push(`created_at < $${values.length}`);
    }
    values.push(filter.limit ?? 200);

    const res = await sql.query<{
      id: string;
      actor_email: string | null;
      action: string;
      resource_type: string;
      resource_id: string | null;
      created_at: Date;
      ip_hint: string | null;
      correlation_id: string | null;
      before_data: unknown;
      after_data: unknown;
    }>(
      `SELECT id::text, actor_email, action, resource_type, resource_id, created_at, ip_hint,
              correlation_id, before_data, after_data
         FROM audit_logs
        ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
        ORDER BY created_at DESC
        LIMIT $${values.length}`,
      values,
    );
    return res.rows.map((r) => ({
      id: r.id,
      actorEmail: r.actor_email,
      action: r.action,
      resourceType: r.resource_type,
      resourceId: r.resource_id,
      createdAt: r.created_at.toISOString(),
      ipHint: r.ip_hint,
      correlationId: r.correlation_id,
      before: r.before_data,
      after: r.after_data,
    }));
  });
}

export type SystemHealth = {
  jobs: { status: string; count: number }[];
  oldestQueuedMinutes: number | null;
  recentFailures: { id: string; eventType: string; channel: string; lastError: string | null; attempts: number; updatedAt: string }[];
  emailSuppressions: number;
  lineLinked: number;
};

export async function getSystemHealth(ctx: DbContext): Promise<SystemHealth> {
  return withTx(ctx, async (sql) => {
    const jobs = await sql.query<{ status: string; count: string }>(
      'SELECT status, count(*)::text AS count FROM notification_jobs GROUP BY status ORDER BY status',
    );
    const oldest = await sql.query<{ minutes: string | null }>(
      `SELECT EXTRACT(EPOCH FROM (now() - min(next_attempt_at))) / 60 AS minutes
         FROM notification_jobs WHERE status IN ('queued','failed') AND next_attempt_at <= now()`,
    );
    const failures = await sql.query<{
      id: string;
      event_type: string;
      channel: string;
      last_error: string | null;
      attempts: number;
      updated_at: Date;
    }>(
      `SELECT id, event_type, channel, last_error, attempts, updated_at
         FROM notification_jobs WHERE status IN ('failed','dead')
        ORDER BY updated_at DESC LIMIT 20`,
    );
    const suppressions = await sql.query<{ count: string }>('SELECT count(*)::text AS count FROM email_suppressions');
    const lineLinked = await sql.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM line_links WHERE status = 'linked'",
    );

    return {
      jobs: jobs.rows.map((r) => ({ status: r.status, count: Number(r.count) })),
      oldestQueuedMinutes: oldest.rows[0]?.minutes ? Math.round(Number(oldest.rows[0].minutes)) : null,
      recentFailures: failures.rows.map((r) => ({
        id: r.id,
        eventType: r.event_type,
        channel: r.channel,
        lastError: r.last_error,
        attempts: r.attempts,
        updatedAt: r.updated_at.toISOString(),
      })),
      emailSuppressions: Number(suppressions.rows[0]?.count ?? 0),
      lineLinked: Number(lineLinked.rows[0]?.count ?? 0),
    };
  });
}
