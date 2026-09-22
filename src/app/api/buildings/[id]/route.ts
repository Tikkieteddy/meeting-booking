import { buildingSchema } from '@/lib/validation/schemas';
import { updateBuilding } from '@/lib/domain/rooms';
import { currentActor } from '@/lib/api/actor';
import { requirePermission } from '@/lib/auth/current-user';
import { apiOk, withApi } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

export const PUT = withApi(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  await requirePermission('room:manage');
  const { id } = await context.params;
  const { actor, ctx } = await currentActor();
  const input = buildingSchema.parse(await request.json());
  const building = await updateBuilding(ctx, id, input, {
    profileId: actor.profileId,
    email: actor.email,
    ipHint: actor.ipHint,
    userAgent: actor.userAgent,
  });
  return apiOk({ building });
});
