import { updateBookingSchema } from '@/lib/validation/schemas';
import { getBookingDetail, updateBooking } from '@/lib/domain/booking-service';
import { isWithinCheckInWindow } from '@/lib/domain/booking-rules';
import { currentActor } from '@/lib/api/actor';
import { apiOk, withApi } from '@/lib/api/respond';
import { NotFoundError } from '@/lib/domain/errors';
import { t } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

export const GET = withApi(async (_request: Request, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  const { actor, ctx } = await currentActor();
  const detail = await getBookingDetail(ctx, id);
  if (!detail) throw new NotFoundError(t('error.notFound'));

  const isOwner = detail.bookerProfileId === actor.profileId;
  const isManager = actor.permissions.includes('booking:manage_all');
  const editableStatus = !['cancelled', 'rejected', 'completed'].includes(detail.status);

  return apiOk({
    booking: {
      ...detail,
      startsAt: detail.startsAt.toISOString(),
      endsAt: detail.endsAt.toISOString(),
      createdAt: detail.createdAt.toISOString(),
      checkedInAt: detail.checkedInAt?.toISOString() ?? null,
      approvals: detail.approvals.map((a) => ({ ...a, decidedAt: a.decidedAt?.toISOString() ?? null })),
      permissions: {
        canEdit: editableStatus && (isOwner || isManager),
        canCancel: editableStatus && (isOwner || isManager),
        canCheckIn:
          detail.status === 'confirmed' &&
          (isOwner || actor.permissions.includes('booking:check_in_any')) &&
          isWithinCheckInWindow(detail.policy, detail.startsAt),
      },
    },
  });
});

export const PATCH = withApi(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  const { actor, ctx } = await currentActor();
  const input = updateBookingSchema.parse(await request.json());
  const booking = await updateBooking(ctx, actor, id, input);
  return apiOk({ booking });
});
