import { createBookingSchema } from '@/lib/validation/schemas';
import { createBooking, createRecurringBookings } from '@/lib/domain/booking-service';
import { listMyBookings } from '@/lib/domain/search';
import { currentActor } from '@/lib/api/actor';
import { requirePermission } from '@/lib/auth/current-user';
import { apiOk, withApi } from '@/lib/api/respond';
import { consumeRateLimit } from '@/lib/util/rate-limit';
import { DomainError } from '@/lib/domain/errors';
import { t } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

export const GET = withApi(async (request: Request) => {
  const { actor, ctx } = await currentActor();
  const upcomingOnly = new URL(request.url).searchParams.get('upcoming') !== 'false';
  const bookings = await listMyBookings(ctx, actor.profileId, { upcomingOnly });
  return apiOk({ bookings });
});

export const POST = withApi(async (request: Request) => {
  await requirePermission('booking:create');
  const { actor, ctx } = await currentActor();

  const limit = await consumeRateLimit(`booking:${actor.profileId}`, 30, 300);
  if (!limit.allowed) throw new DomainError(t('error.rateLimited'), 'rate_limited', 429);

  const input = createBookingSchema.parse(await request.json());

  if (input.recurrence) {
    const result = await createRecurringBookings(ctx, actor, { ...input, recurrence: input.recurrence });
    return apiOk(
      {
        bookings: result.created,
        skipped: result.skipped,
        seriesId: result.seriesId,
        requiresApproval: result.created.some((b) => b.status === 'pending'),
      },
      { status: 201 },
    );
  }

  const { booking, requiresApproval } = await createBooking(ctx, actor, input);
  return apiOk({ booking, requiresApproval }, { status: 201 });
});
