import { roomSchema } from '@/lib/validation/schemas';
import { createRoom, listRooms } from '@/lib/domain/rooms';
import { currentActor } from '@/lib/api/actor';
import { requirePermission } from '@/lib/auth/current-user';
import { apiOk, withApi } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

export const GET = withApi(async (request: Request) => {
  const { ctx } = await currentActor();
  const includeArchived = new URL(request.url).searchParams.get('includeArchived') === 'true';
  const rooms = await listRooms(ctx, { includeArchived, includeInactive: includeArchived });
  return apiOk({ rooms });
});

/** เพิ่มห้องใหม่ — ห้องจะปรากฏใน dropdown, search และปฏิทินทันที (AC06) */
export const POST = withApi(async (request: Request) => {
  await requirePermission('room:manage');
  const { actor, ctx } = await currentActor();
  const input = roomSchema.parse(await request.json());
  const room = await createRoom(ctx, actor.organizationId, input, {
    profileId: actor.profileId,
    email: actor.email,
    ipHint: actor.ipHint,
    userAgent: actor.userAgent,
  });
  return apiOk({ room }, { status: 201 });
});
