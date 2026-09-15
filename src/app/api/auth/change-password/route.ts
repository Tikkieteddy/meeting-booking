import { changePasswordSchema } from '@/lib/validation/schemas';
import { changePassword } from '@/lib/auth/service';
import { requireUser } from '@/lib/auth/current-user';
import { apiOk, withApi } from '@/lib/api/respond';
import { auditStandalone } from '@/lib/audit';

export const POST = withApi(async (request: Request) => {
  const user = await requireUser();
  const body = changePasswordSchema.parse(await request.json());
  await changePassword(user.id, body.currentPassword, body.newPassword);
  await auditStandalone({
    actorProfileId: user.id,
    actorEmail: user.email,
    action: 'auth.change_password',
    resourceType: 'auth',
    resourceId: user.id,
  });
  return apiOk({ ok: true });
});
