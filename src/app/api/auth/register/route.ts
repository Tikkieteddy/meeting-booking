import { registerSchema } from '@/lib/validation/schemas';
import { registerUser } from '@/lib/auth/service';
import { apiOk, withApi } from '@/lib/api/respond';
import { consumeRateLimit } from '@/lib/util/rate-limit';
import { headers } from 'next/headers';
import { maskIp } from '@/lib/auth/current-user';
import { AuthServiceError } from '@/lib/auth/service';
import { t } from '@/lib/i18n';
import { env } from '@/lib/env';

export const POST = withApi(async (request: Request) => {
  const h = await headers();
  const rawIp = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const limit = await consumeRateLimit(`register:${rawIp ? maskIp(rawIp) : 'unknown'}`, 5, 3600);
  if (!limit.allowed) throw new AuthServiceError(t('error.rateLimited'), 'rate_limited');

  const body = registerSchema.parse(await request.json());
  await registerUser(body);
  // ไม่คืน token กลับไปให้ client — ลิงก์ยืนยันส่งทางอีเมลเท่านั้น
  // บัญชีใช้งานได้ทันทีโดยไม่ต้องยืนยันอีเมล — เดิมขึ้นว่า "ส่งอีเมลยืนยันแล้ว" แม้ระบบยังไม่ได้เชื่อมอีเมล
  // ผู้ใช้จึงรออีเมลที่ไม่มีวันมา และเข้าใจว่าสมัครไม่สำเร็จ
  const emailReady = env().EMAIL_PROVIDER === 'resend';
  return apiOk(
    { message: emailReady ? t('auth.registeredWithEmail') : t('auth.registeredNoEmail') },
    { status: 201 },
  );
});
