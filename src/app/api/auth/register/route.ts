import { registerSchema } from '@/lib/validation/schemas';
import { registerUser } from '@/lib/auth/service';
import { apiOk, withApi } from '@/lib/api/respond';
import { consumeRateLimit } from '@/lib/util/rate-limit';
import { headers } from 'next/headers';
import { maskIp } from '@/lib/auth/current-user';
import { AuthServiceError } from '@/lib/auth/service';
import { t } from '@/lib/i18n';

export const POST = withApi(async (request: Request) => {
  const h = await headers();
  const rawIp = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const limit = await consumeRateLimit(`register:${rawIp ? maskIp(rawIp) : 'unknown'}`, 5, 3600);
  if (!limit.allowed) throw new AuthServiceError(t('error.rateLimited'), 'rate_limited');

  const body = registerSchema.parse(await request.json());
  await registerUser(body);
  // ไม่คืน token กลับไปให้ client — ผู้ใช้ต้องกดลิงก์จากอีเมลเท่านั้น
  return apiOk({ message: t('auth.verifyEmailSent') }, { status: 201 });
});
