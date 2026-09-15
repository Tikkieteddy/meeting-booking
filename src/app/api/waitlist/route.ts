import { waitlistSchema } from '@/lib/validation/schemas';
import { joinWaitlist } from '@/lib/domain/booking-service';
import { currentActor } from '@/lib/api/actor';
import { apiOk, withApi } from '@/lib/api/respond';

export const POST = withApi(async (request: Request) => {
  const { actor, ctx } = await currentActor();
  const input = waitlistSchema.parse(await request.json());
  const id = await joinWaitlist(ctx, actor, input);
  return apiOk({ id }, { status: 201 });
});
