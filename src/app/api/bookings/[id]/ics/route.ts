import { getBookingDetail } from '@/lib/domain/booking-service';
import { buildIcs } from '@/lib/notify/ics';
import { currentActor } from '@/lib/api/actor';
import { withApi } from '@/lib/api/respond';
import { NotFoundError } from '@/lib/domain/errors';
import { t } from '@/lib/i18n';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

export const GET = withApi(async (_request: Request, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  const { ctx } = await currentActor();
  const detail = await getBookingDetail(ctx, id);
  if (!detail) throw new NotFoundError(t('error.notFound'));

  const ics = buildIcs({
    uid: `${detail.id}@tnn-meeting`,
    title: detail.canSeeDetails ? detail.title : t('booking.busySlot'),
    // วัตถุประสงค์ (เฉพาะคนที่มีสิทธิ์เห็น) + ลิงก์แผนที่ (ทุกคน) ในคำอธิบายเดียวกัน
    description:
      [detail.canSeeDetails ? detail.purpose : null, detail.roomMapLink ? `แผนที่: ${detail.roomMapLink}` : null]
        .filter(Boolean)
        .join('\n') || null,
    location: `${detail.roomName} (${detail.roomCode})`,
    geo:
      detail.roomLatitude != null && detail.roomLongitude != null
        ? { latitude: detail.roomLatitude, longitude: detail.roomLongitude }
        : null,
    startsAt: detail.startsAt,
    endsAt: detail.endsAt,
    organizerEmail: detail.bookerEmail,
    organizerName: detail.bookerName,
    attendeeEmails: detail.attendees.map((a) => a.email),
    status: detail.status === 'cancelled' || detail.status === 'rejected' ? 'CANCELLED' : detail.status === 'pending' ? 'TENTATIVE' : 'CONFIRMED',
    sequence: detail.version,
    url: `${env().NEXT_PUBLIC_APP_URL}/bookings/${detail.id}`,
  });

  return new Response(ics, {
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': `attachment; filename="booking-${detail.id}.ics"`,
      'cache-control': 'no-store',
    },
  });
});
