import { approvalDecisionSchema } from '@/lib/validation/schemas';
import { decideApproval } from '@/lib/domain/booking-service';
import { currentActor } from '@/lib/api/actor';
import { requirePermission } from '@/lib/auth/current-user';
import { apiOk, withApi } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

/** id ในเส้นทางนี้คือ booking id ที่รออนุมัติ */
export const POST = withApi(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  await requirePermission('booking:approve');
  const { id } = await context.params;
  const { actor, ctx } = await currentActor();
  const body = approvalDecisionSchema.parse(await request.json());
  const booking = await decideApproval(ctx, actor, id, body.decision, body.comment ?? null);
  return apiOk({ booking });
});
