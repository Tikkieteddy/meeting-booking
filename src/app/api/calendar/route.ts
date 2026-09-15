import { calendarQuerySchema } from '@/lib/validation/schemas';
import { getCalendarData, openMinutesOf } from '@/lib/domain/calendar';
import { listRooms } from '@/lib/domain/rooms';
import { currentActor } from '@/lib/api/actor';
import { apiOk, withApi } from '@/lib/api/respond';

/**
 * ข้อมูลปฏิทินตามมุมมอง/วันที่/ห้อง
 * ไม่ cache — ความพร้อมของห้องต้องสดใหม่เสมอ (บรีฟข้อ 15)
 */
export const dynamic = 'force-dynamic';

export const GET = withApi(async (request: Request) => {
  const { actor, ctx } = await currentActor();
  const url = new URL(request.url);
  const query = calendarQuerySchema.parse({
    view: url.searchParams.get('view') ?? 'day',
    date: url.searchParams.get('date'),
    roomId: url.searchParams.get('roomId') || null,
  });

  const rooms = await listRooms(ctx);
  const selected = query.roomId ? rooms.find((r) => r.id === query.roomId) : null;

  const data = await getCalendarData(ctx, {
    view: query.view,
    dateISO: query.date,
    roomId: selected?.id ?? null,
    organizationId: actor.organizationId,
    openMinutesPerDay: selected
      ? openMinutesOf(selected.policy.openTime, selected.policy.closeTime)
      : rooms.reduce((sum, room) => sum + openMinutesOf(room.policy.openTime, room.policy.closeTime), 0) || 720,
  });

  return apiOk(data, { correlationId: actor.correlationId ?? undefined });
});
