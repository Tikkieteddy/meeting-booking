import { currentActor } from '@/lib/api/actor';
import { requirePermission } from '@/lib/auth/current-user';
import { apiOk, withApi } from '@/lib/api/respond';
import { searchPeople } from '@/lib/domain/people';

export const dynamic = 'force-dynamic';

/** ค้นหาคนในองค์กรเพื่อเพิ่มเป็นผู้เข้าร่วม — ใช้ได้เฉพาะคนที่จองห้องได้ */
export const GET = withApi(async (request: Request) => {
  await requirePermission('booking:create');
  const { ctx } = await currentActor();
  const q = new URL(request.url).searchParams.get('q') ?? '';
  return apiOk({ people: await searchPeople(ctx, q.slice(0, 80)) });
});
