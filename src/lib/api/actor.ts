import 'server-only';
import { requireUser } from '@/lib/auth/current-user';
import { requestMeta } from '@/lib/auth/current-user';
import type { DbContext } from '@/lib/db/pool';
import type { Actor } from '@/lib/domain/booking-service';
import { newCorrelationId } from '@/lib/util/logger';

/** รวบรวมข้อมูลผู้ใช้ปัจจุบันให้อยู่ในรูปที่ชั้น domain ใช้ได้ พร้อม context สำหรับ RLS */
export async function currentActor(): Promise<{ actor: Actor; ctx: DbContext }> {
  const user = await requireUser();
  const meta = await requestMeta();
  const correlationId = newCorrelationId();
  return {
    actor: {
      profileId: user.id,
      organizationId: user.organizationId,
      email: user.email,
      fullName: user.fullName,
      department: user.department,
      permissions: user.permissions,
      ipHint: meta.ipHint,
      userAgent: meta.userAgent,
      correlationId,
    },
    ctx: { userId: user.id, role: 'authenticated', correlationId },
  };
}
