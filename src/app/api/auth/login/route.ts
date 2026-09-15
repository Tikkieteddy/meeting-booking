import { cookies, headers } from 'next/headers';
import { loginSchema } from '@/lib/validation/schemas';
import { login } from '@/lib/auth/service';
import { createSession, SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth/session';
import { apiOk, withApi } from '@/lib/api/respond';
import { auditStandalone } from '@/lib/audit';
import { maskIp } from '@/lib/auth/current-user';

export const POST = withApi(async (request: Request) => {
  const body = loginSchema.parse(await request.json());
  const h = await headers();
  const rawIp = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const meta = { ipHint: rawIp ? maskIp(rawIp) : null, userAgent: h.get('user-agent')?.slice(0, 200) ?? null };

  const user = await login(body.email, body.password, meta);
  const { token, expiresAt } = await createSession(user.id, meta);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));

  await auditStandalone({
    actorProfileId: user.id,
    actorEmail: user.email,
    action: 'auth.login',
    resourceType: 'auth',
    resourceId: user.id,
    ipHint: meta.ipHint,
    userAgent: meta.userAgent,
  });

  return apiOk({
    user: { id: user.id, email: user.email, fullName: user.fullName, onboarded: user.onboardedAt !== null },
  });
});
