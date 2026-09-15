import 'server-only';
import { withServiceTx, type Sql } from '@/lib/db/pool';
import { env } from '@/lib/env';
import { hashToken, newToken } from './tokens';
import type { RoleAssignment, PermissionCode, RoleCode, ScopeType } from '@/lib/rbac/permissions';
import { permissionsOf } from '@/lib/rbac/permissions';
import type { Locale } from '@/lib/i18n';

export const SESSION_COOKIE = 'tnn_session';

export type SessionUser = {
  id: string;
  organizationId: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  phone: string | null;
  department: string | null;
  jobTitle: string | null;
  locale: Locale;
  timezone: string;
  status: 'invited' | 'active' | 'suspended' | 'deactivated';
  emailVerifiedAt: Date | null;
  onboardedAt: Date | null;
  roles: RoleAssignment[];
  permissions: PermissionCode[];
};

type ProfileRow = {
  id: string;
  organization_id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  phone: string | null;
  department: string | null;
  job_title: string | null;
  locale: string;
  timezone: string;
  status: string;
  email_verified_at: Date | null;
  onboarded_at: Date | null;
};

export async function loadRoles(sql: Sql, profileId: string): Promise<RoleAssignment[]> {
  const res = await sql.query<{ role_code: string; scope_type: string; scope_id: string | null }>(
    'SELECT role_code, scope_type, scope_id FROM user_roles WHERE profile_id = $1',
    [profileId],
  );
  return res.rows.map((r) => ({
    roleCode: r.role_code as RoleCode,
    scopeType: r.scope_type as ScopeType,
    scopeId: r.scope_id,
  }));
}

export function toSessionUser(profile: ProfileRow, roles: RoleAssignment[]): SessionUser {
  return {
    id: profile.id,
    organizationId: profile.organization_id,
    email: profile.email,
    fullName: profile.full_name,
    avatarUrl: profile.avatar_url,
    phone: profile.phone,
    department: profile.department,
    jobTitle: profile.job_title,
    locale: (profile.locale === 'en' ? 'en' : 'th') as Locale,
    timezone: profile.timezone,
    status: profile.status as SessionUser['status'],
    emailVerifiedAt: profile.email_verified_at,
    onboardedAt: profile.onboarded_at,
    roles,
    permissions: [...permissionsOf(roles)],
  };
}

/** สร้าง session ใหม่ คืนค่า token ดิบสำหรับใส่ใน cookie (เก็บเฉพาะ hash ในฐานข้อมูล) */
export async function createSession(
  profileId: string,
  meta: { userAgent?: string | null; ipHint?: string | null } = {},
): Promise<{ token: string; expiresAt: Date }> {
  const token = newToken();
  const expiresAt = new Date(Date.now() + env().AUTH_SESSION_HOURS * 3600_000);
  await withServiceTx(async (sql) => {
    await sql.query(
      `INSERT INTO user_sessions (profile_id, token_hash, user_agent, ip_hint, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [profileId, hashToken(token), meta.userAgent ?? null, meta.ipHint ?? null, expiresAt],
    );
    await sql.query('UPDATE profiles SET last_login_at = now() WHERE id = $1', [profileId]);
  });
  return { token, expiresAt };
}

/** อ่าน session จาก token — คืน null ถ้าหมดอายุ ถูกเพิกถอน หรือบัญชีถูกระงับ */
export async function resolveSession(token: string | undefined | null): Promise<SessionUser | null> {
  if (!token) return null;
  return withServiceTx(async (sql) => {
    const res = await sql.query<ProfileRow>(
      `SELECT p.id, p.organization_id, p.email, p.full_name, p.avatar_url, p.phone,
              p.department, p.job_title, p.locale, p.timezone, p.status,
              p.email_verified_at, p.onboarded_at
         FROM user_sessions s
         JOIN profiles p ON p.id = s.profile_id
        WHERE s.token_hash = $1
          AND s.revoked_at IS NULL
          AND s.expires_at > now()`,
      [hashToken(token)],
    );
    const profile = res.rows[0];
    if (!profile) return null;
    if (profile.status !== 'active') return null;
    const roles = await loadRoles(sql, profile.id);
    return toSessionUser(profile, roles);
  });
}

export async function revokeSession(token: string): Promise<void> {
  await withServiceTx(async (sql) => {
    await sql.query('UPDATE user_sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL', [
      hashToken(token),
    ]);
  });
}

/** ออกจากระบบทุกอุปกรณ์ (บรีฟข้อ 7.1) */
export async function revokeAllSessions(profileId: string): Promise<number> {
  return withServiceTx(async (sql) => {
    const res = await sql.query(
      'UPDATE user_sessions SET revoked_at = now() WHERE profile_id = $1 AND revoked_at IS NULL',
      [profileId],
    );
    return res.rowCount;
  });
}

export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  };
}
