import { currentActor } from '@/lib/api/actor';
import { requirePermission } from '@/lib/auth/current-user';
import { apiOk, withApi } from '@/lib/api/respond';
import { listRoleSettings, setRoleEnabled } from '@/lib/domain/roles-admin';
import { roleToggleSchema } from '@/lib/validation/schemas';

export const dynamic = 'force-dynamic';

export const GET = withApi(async () => {
  await requirePermission('role:manage');
  const { ctx } = await currentActor();
  return apiOk({ roles: await listRoleSettings(ctx) });
});

export const PATCH = withApi(async (request: Request) => {
  await requirePermission('role:manage');
  const { actor, ctx } = await currentActor();
  const body = roleToggleSchema.parse(await request.json());
  const roles = await setRoleEnabled(ctx, actor, body.code, body.enabled);
  return apiOk({ roles });
});
