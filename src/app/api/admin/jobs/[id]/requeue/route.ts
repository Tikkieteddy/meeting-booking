import { requeueJob } from '@/lib/notify/worker';
import { requirePermission } from '@/lib/auth/current-user';
import { auditStandalone } from '@/lib/audit';
import { apiOk, withApi } from '@/lib/api/respond';
import { NotFoundError } from '@/lib/domain/errors';

export const POST = withApi(async (_request: Request, context: { params: Promise<{ id: string }> }) => {
  const admin = await requirePermission('system:manage');
  const { id } = await context.params;
  const ok = await requeueJob(id);
  if (!ok) throw new NotFoundError('ไม่พบงานที่สั่งส่งใหม่ได้ (งานอาจส่งสำเร็จแล้ว)');
  await auditStandalone({
    actorProfileId: admin.id,
    actorEmail: admin.email,
    action: 'notification.requeue',
    resourceType: 'notification_job',
    resourceId: id,
  });
  return apiOk({ ok: true });
});
