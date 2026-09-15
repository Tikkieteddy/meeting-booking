import { resetPasswordSchema } from '@/lib/validation/schemas';
import { resetPassword } from '@/lib/auth/service';
import { apiOk, withApi } from '@/lib/api/respond';

export const POST = withApi(async (request: Request) => {
  const body = resetPasswordSchema.parse(await request.json());
  await resetPassword(body.token, body.password);
  return apiOk({ ok: true });
});
