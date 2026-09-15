import { resetPasswordSchema } from '@/lib/validation/schemas';
import { acceptInvite } from '@/lib/auth/service';
import { apiOk, withApi } from '@/lib/api/respond';

export const POST = withApi(async (request: Request) => {
  const body = resetPasswordSchema.parse(await request.json());
  await acceptInvite(body.token, body.password);
  return apiOk({ ok: true });
});
