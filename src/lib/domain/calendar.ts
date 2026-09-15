import 'server-only';
import { withTx, type DbContext, type Sql } from '@/lib/db/pool';
import { DEFAULT_TZ, endOfLocalDay, startOfLocalDay } from '@/lib/util/time';
import {
  openMinutesOf,
  rangeForView,
  summarizeMonth,
  type CalendarBooking,
  type CalendarClosure,
  type CalendarData,
  type CalendarHoliday,
  type CalendarView,
  type MonthDaySummary,
} from './calendar-shared';

export * from './calendar-shared';
export { openMinutesOf, rangeForView, summarizeMonth };

function tz(): string {
  return process.env.APP_TIMEZONE || DEFAULT_TZ;
}

async function fetchBookings(
  sql: Sql,
  opts: { fromISO: string; toISO: string; roomId: string | null; currentUserId: string | null },
): Promise<CalendarBooking[]> {
  const from = startOfLocalDay(opts.fromISO, tz());
  const to = endOfLocalDay(opts.toISO, tz());
  const res = await sql.query<{
    id: string;
    room_id: string;
    title: string;
    starts_at: Date;
    ends_at: Date;
    status: string;
    privacy: string;
    booker_name: string | null;
    booker_department: string | null;
    attendee_count: number;
    can_see_details: boolean;
    booker_profile_id: string;
    checked_in_at: Date | null;
  }>(
    `SELECT v.id, v.room_id, v.title, v.starts_at, v.ends_at, v.status, v.privacy,
            v.booker_name, v.booker_department, v.attendee_count, v.can_see_details,
            v.booker_profile_id, v.checked_in_at
       FROM app.v_calendar_bookings v
      WHERE v.status NOT IN ('cancelled', 'rejected')
        AND v.starts_at < $2
        AND v.ends_at > $1
        AND ($3::uuid IS NULL OR v.room_id = $3::uuid)
      ORDER BY v.starts_at, v.ends_at`,
    [from, to, opts.roomId],
  );
  return res.rows.map((r) => ({
    id: r.id,
    roomId: r.room_id,
    title: r.title,
    startsAt: r.starts_at.toISOString(),
    endsAt: r.ends_at.toISOString(),
    status: r.status,
    privacy: r.privacy,
    bookerName: r.booker_name,
    bookerDepartment: r.booker_department,
    attendeeCount: r.attendee_count,
    canSeeDetails: r.can_see_details,
    isMine: opts.currentUserId !== null && r.booker_profile_id === opts.currentUserId,
    checkedIn: r.checked_in_at !== null,
  }));
}

async function fetchClosures(sql: Sql, fromISO: string, toISO: string, roomId: string | null): Promise<CalendarClosure[]> {
  const res = await sql.query<{ room_id: string; starts_at: Date; ends_at: Date; reason: string }>(
    `SELECT room_id, starts_at, ends_at, reason FROM room_closures
      WHERE starts_at < $2 AND ends_at > $1 AND ($3::uuid IS NULL OR room_id = $3::uuid)
      ORDER BY starts_at`,
    [startOfLocalDay(fromISO, tz()), endOfLocalDay(toISO, tz()), roomId],
  );
  return res.rows.map((r) => ({
    roomId: r.room_id,
    startsAt: r.starts_at.toISOString(),
    endsAt: r.ends_at.toISOString(),
    reason: r.reason,
  }));
}

async function fetchHolidays(sql: Sql, organizationId: string, fromISO: string, toISO: string): Promise<CalendarHoliday[]> {
  const res = await sql.query<{ holiday_date: string; name: string }>(
    `SELECT to_char(holiday_date,'YYYY-MM-DD') AS holiday_date, name
       FROM holidays
      WHERE organization_id = $1 AND holiday_date BETWEEN $2::date AND $3::date
      ORDER BY holiday_date`,
    [organizationId, fromISO, toISO],
  );
  return res.rows.map((r) => ({ dateISO: r.holiday_date, name: r.name }));
}

/**
 * ข้อมูลปฏิทินทั้งหน้า — ใช้ query ชุดเดียวกันทุกมุมมอง
 * มุมมองเดือนจะสรุปเป็นรายวันเพื่อไม่ยัดรายละเอียดทุกการจองจนแน่น (บรีฟข้อ 3.3)
 */
export async function getCalendarData(
  ctx: DbContext,
  opts: {
    view: CalendarView;
    dateISO: string;
    roomId: string | null;
    organizationId: string;
    /** นาทีเปิดทำการต่อวัน ใช้คำนวณระดับความหนาแน่นของ Month View */
    openMinutesPerDay?: number;
    weekStartsOn?: number;
  },
): Promise<CalendarData> {
  const range = rangeForView(opts.view, opts.dateISO, opts.weekStartsOn ?? 1);

  return withTx(ctx, async (sql) => {
    const [bookings, closures, holidays] = await Promise.all([
      fetchBookings(sql, { fromISO: range.start, toISO: range.end, roomId: opts.roomId, currentUserId: ctx.userId }),
      fetchClosures(sql, range.start, range.end, opts.roomId),
      fetchHolidays(sql, opts.organizationId, range.start, range.end),
    ]);

    let monthDays: MonthDaySummary[] = [];
    if (opts.view === 'month') {
      monthDays = summarizeMonth(bookings, range.start, range.end, holidays, opts.openMinutesPerDay ?? 12 * 60);
    }

    return {
      view: opts.view,
      dateISO: opts.dateISO,
      rangeStartISO: range.start,
      rangeEndISO: range.end,
      bookings,
      closures,
      holidays,
      monthDays,
    };
  });
}

