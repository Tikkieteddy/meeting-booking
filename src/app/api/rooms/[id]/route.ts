import { roomSchema } from '@/lib/validation/schemas';
import { getRoom, updateRoom } from '@/lib/domain/rooms';
import { currentActor } from '@/lib/api/actor';
import { requirePermission } from '@/lib/auth/current-user';
import { apiOk, withApi } from '@/lib/api/respond';
import { NotFoundError } from '@/lib/domain/errors';
import { t } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

export const GET = withApi(async (_request: Request, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  const { ctx } = await currentActor();
  const room = await getRoom(ctx, id);
  if (!room) throw new NotFoundError(t('error.notFound'));
  return apiOk({ room });
});

export const PUT = withApi(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  await requirePermission('room:manage');
  const { id } = await context.params;
  const { actor, ctx } = await currentActor();
  const input = roomSchema.parse(await request.json());
  const room = await updateRoom(ctx, id, input, {
    profileId: actor.profileId,
    email: actor.email,
    ipHint: actor.ipHint,
    userAgent: actor.userAgent,
  });
  return apiOk({ room });
});
