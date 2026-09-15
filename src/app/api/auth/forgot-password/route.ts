import { forgotPasswordSchema } from '@/lib/validation/schemas';
import { requestPasswordReset } from '@/lib/auth/service';
import { apiOk, withApi } from '@/lib/api/respond';
import { t } from '@/lib/i18n';

export const POST = withApi(async (request: Request) => {
  const body = forgotPasswordSchema.parse(await request.json());
  await requestPasswordReset(body.email);
  // ตอบข้อความเดียวกันเสมอ ไม่บอกว่าอีเมลนี้มีอยู่จริงหรือไม่
  return apiOk({ message: t('auth.resetLinkSent') });
});
