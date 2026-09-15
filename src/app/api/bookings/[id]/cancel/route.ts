import { cancelBookingSchema } from '@/lib/validation/schemas';
import { cancelBooking } from '@/lib/domain/booking-service';
import { currentActor } from '@/lib/api/actor';
import { apiOk, withApi } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

export const POST = withApi(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  const { actor, ctx } = await currentActor();
  const body = cancelBookingSchema.parse(await request.json().catch(() => ({})));
  const result = await cancelBooking(ctx, actor, id, body.reason ?? null, body.scope);
  return apiOk(result);
});
