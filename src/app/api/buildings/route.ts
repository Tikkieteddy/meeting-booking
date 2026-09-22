import { buildingSchema } from '@/lib/validation/schemas';
import { createBuilding, listBuildings } from '@/lib/domain/rooms';
import { currentActor } from '@/lib/api/actor';
import { requirePermission } from '@/lib/auth/current-user';
import { apiOk, withApi } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

export const GET = withApi(async (request: Request) => {
  const { ctx } = await currentActor();
  const includeInactive = new URL(request.url).searchParams.get('includeInactive') === 'true';
  return apiOk({ buildings: await listBuildings(ctx, { includeInactive }) });
});

/** เพิ่มอาคาร — โผล่ในช่อง "อาคาร" ของฟอร์มห้องทันที */
export const POST = withApi(async (request: Request) => {
  await requirePermission('room:manage');
  const { actor, ctx } = await currentActor();
  const input = buildingSchema.parse(await request.json());
  const building = await createBuilding(ctx, actor.organizationId, input, {
    profileId: actor.profileId,
    email: actor.email,
    ipHint: actor.ipHint,
    userAgent: actor.userAgent,
  });
  return apiOk({ building }, { status: 201 });
});
