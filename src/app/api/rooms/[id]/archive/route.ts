import { archiveRoom, restoreRoom } from '@/lib/domain/rooms';
import { currentActor } from '@/lib/api/actor';
import { requirePermission } from '@/lib/auth/current-user';
import { apiOk, withApi } from '@/lib/api/respond';

/**
 * เก็บห้องเข้าคลัง / นำกลับมาใช้
 * ระบบไม่มี endpoint สำหรับ "ลบ" ห้อง เพราะห้องที่มีประวัติการจองต้องคงไว้
 * เพื่อรักษารายงานและ audit trail (บรีฟข้อ 9)
 */
export const POST = withApi(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  await requirePermission('room:manage');
  const { id } = await context.params;
  const { actor, ctx } = await currentActor();
  const body = (await request.json().catch(() => ({}))) as { action?: string };

  if (body.action === 'restore') {
    await restoreRoom(ctx, id, { profileId: actor.profileId, email: actor.email });
    return apiOk({ archived: false });
  }
  await archiveRoom(ctx, id, { profileId: actor.profileId, email: actor.email });
  return apiOk({ archived: true });
});
