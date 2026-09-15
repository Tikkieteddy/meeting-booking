import 'server-only';
import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { SESSION_COOKIE, resolveSession, type SessionUser } from './session';
import type { PermissionCode } from '@/lib/rbac/permissions';
import { t } from '@/lib/i18n';

/** ผู้ใช้ปัจจุบันของ request นี้ (cache ต่อหนึ่ง request) */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  return resolveSession(store.get(SESSION_COOKIE)?.value);
});

export class AuthError extends Error {
  constructor(
    message: string,
    readonly code: 'unauthorized' | 'forbidden',
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

/** บังคับว่าต้องล็อกอิน — ใช้ใน route handler และ server action */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AuthError(t('error.unauthorized'), 'unauthorized');
  return user;
}

/** บังคับว่าต้องมีสิทธิ์ที่ระบุ (ตรวจซ้ำอีกชั้นที่ฐานข้อมูลด้วย RLS) */
export async function requirePermission(code: PermissionCode): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.permissions.includes(code)) throw new AuthError(t('error.forbidden'), 'forbidden');
  return user;
}

export function can(user: SessionUser | null, code: PermissionCode): boolean {
  return Boolean(user?.permissions.includes(code));
}

/** ข้อมูลประกอบสำหรับ audit log — ไม่เก็บ IP เต็ม เก็บเฉพาะ prefix เพื่อลดข้อมูลส่วนบุคคล */
export async function requestMeta(): Promise<{ ipHint: string | null; userAgent: string | null }> {
  const h = await headers();
  const forwarded = h.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() ?? null;
  return {
    ipHint: ip ? maskIp(ip) : null,
    userAgent: h.get('user-agent')?.slice(0, 200) ?? null,
  };
}

export function maskIp(ip: string): string {
  if (ip.includes(':')) {
    const parts = ip.split(':');
    return `${parts.slice(0, 3).join(':')}::/48`;
  }
  const parts = ip.split('.');
  return `${parts.slice(0, 3).join('.')}.0/24`;
}
