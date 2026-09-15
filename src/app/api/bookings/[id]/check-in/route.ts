import { checkInBooking } from '@/lib/domain/booking-service';
import { currentActor } from '@/lib/api/actor';
import { apiOk, withApi } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

export const POST = withApi(async (_request: Request, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  const { actor, ctx } = await currentActor();
  const booking = await checkInBooking(ctx, actor, id);
  return apiOk({ booking });
});
