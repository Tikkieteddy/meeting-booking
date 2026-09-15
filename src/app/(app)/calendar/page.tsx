import { redirect } from 'next/navigation';
import { CalendarClient } from '@/components/calendar/calendar-client';
import { getSessionUser } from '@/lib/auth/current-user';
import { getCalendarData, openMinutesOf, type CalendarView } from '@/lib/domain/calendar';
import { listAmenities, listBuildings, listRooms } from '@/lib/domain/rooms';
import { toDateISO } from '@/lib/util/time';
import { t } from '@/lib/i18n';

export const metadata = { title: t('nav.calendar') };
export const dynamic = 'force-dynamic';

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string; room?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  const params = await searchParams;
  const view: CalendarView = params.view === 'week' || params.view === 'month' ? params.view : 'day';
  const dateISO = /^\d{4}-\d{2}-\d{2}$/.test(params.date ?? '') ? params.date! : toDateISO(new Date(), user.timezone);
  const ctx = { userId: user.id, role: 'authenticated' as const };

  const [rooms, amenities, buildings] = await Promise.all([listRooms(ctx), listAmenities(ctx), listBuildings(ctx)]);
  const roomId = params.room && rooms.some((r) => r.id === params.room) ? params.room : null;
  const selected = roomId ? rooms.find((r) => r.id === roomId) : null;

  const data = await getCalendarData(ctx, {
    view,
    dateISO,
    roomId,
    organizationId: user.organizationId,
    openMinutesPerDay: selected
      ? openMinutesOf(selected.policy.openTime, selected.policy.closeTime)
      : rooms.reduce((sum, room) => sum + openMinutesOf(room.policy.openTime, room.policy.closeTime), 0) || 720,
  });

  return (
    <CalendarClient
      rooms={rooms}
      amenities={amenities}
      buildings={buildings}
      initialData={data}
      initialView={view}
      initialDateISO={dateISO}
      initialRoomId={roomId}
      canBook={user.permissions.includes('booking:create')}
      canOverride={user.permissions.includes('booking:manage_all')}
      showTutorial={user.onboardedAt === null}
    />
  );
}
