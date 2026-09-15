import 'server-only';
import { withServiceTx, type Sql } from '@/lib/db/pool';
import { env, allowedEmailDomains } from '@/lib/env';
import { t } from '@/lib/i18n';
import { auditStandalone } from '@/lib/audit';
import { enqueueNotification } from '@/lib/notify/queue';
import { consumeRateLimit } from '@/lib/util/rate-limit';
import { hashPassword, isStrongEnough, verifyPassword } from './password';
import { hashToken, newToken } from './tokens';
import { loadRoles, toSessionUser, type SessionUser } from './session';
import type { RoleCode } from '@/lib/rbac/permissions';

export class AuthServiceError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly field?: string,
  ) {
    super(message);
    this.name = 'AuthServiceError';
  }
}

const VERIFY_TOKEN_HOURS = 24;
const RESET_TOKEN_MINUTES = 60;
const LOGIN_MAX_ATTEMPTS = 8;
const LOGIN_WINDOW_SECONDS = 15 * 60;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function assertEmailDomainAllowed(email: string): void {
  const domains = allowedEmailDomains();
  if (domains.length === 0) return;
  const domain = normalizeEmail(email).split('@')[1] ?? '';
  if (!domains.includes(domain)) {
    throw new AuthServiceError(t('auth.domainNotAllowed', { domains: domains.join(', ') }), 'domain_not_allowed', 'email');
  }
}

type ProfileRow = Parameters<typeof toSessionUser>[0];

const PROFILE_COLUMNS = `p.id, p.organization_id, p.email, p.full_name, p.avatar_url, p.phone,
  p.department, p.job_title, p.locale, p.timezone, p.status, p.email_verified_at, p.onboarded_at`;

async function findProfileByEmail(sql: Sql, email: string): Promise<ProfileRow | null> {
  const res = await sql.query<ProfileRow>(
    `SELECT ${PROFILE_COLUMNS} FROM profiles p WHERE lower(p.email) = $1 LIMIT 1`,
    [normalizeEmail(email)],
  );
  return res.rows[0] ?? null;
}

async function issueToken(
  sql: Sql,
  profileId: string,
  purpose: 'email_verify' | 'password_reset' | 'invite' | 'line_link',
  ttlMs: number,
): Promise<string> {
  // โทเค็นเก่าที่ยังไม่ใช้ของ purpose เดียวกันให้ถือว่าใช้แล้ว กันมีหลายใบพร้อมกัน
  await sql.query(
    `UPDATE auth_tokens SET used_at = now() WHERE profile_id = $1 AND purpose = $2 AND used_at IS NULL`,
    [profileId, purpose],
  );
  const token = newToken();
  await sql.query(
    `INSERT INTO auth_tokens (profile_id, purpose, token_hash, expires_at) VALUES ($1,$2,$3,$4)`,
    [profileId, purpose, hashToken(token), new Date(Date.now() + ttlMs)],
  );
  return token;
}

async function consumeToken(
  sql: Sql,
  token: string,
  purpose: 'email_verify' | 'password_reset' | 'invite' | 'line_link',
): Promise<string> {
  const res = await sql.query<{ id: string; profile_id: string }>(
    `UPDATE auth_tokens SET used_at = now()
      WHERE token_hash = $1 AND purpose = $2 AND used_at IS NULL AND expires_at > now()
      RETURNING id, profile_id`,
    [hashToken(token), purpose],
  );
  const row = res.rows[0];
  if (!row) throw new AuthServiceError('ลิงก์นี้หมดอายุหรือถูกใช้ไปแล้ว กรุณาขอลิงก์ใหม่', 'token_invalid');
  return row.profile_id;
}

// ------------------------------------------------------------
// สมัครสมาชิก
// ------------------------------------------------------------
export type RegisterInput = {
  email: string;
  password: string;
  fullName: string;
  department?: string | null;
  phone?: string | null;
};

export async function registerUser(input: RegisterInput): Promise<{ profileId: string; verifyToken: string }> {
  if (!env().AUTH_ALLOW_SELF_REGISTER) {
    throw new AuthServiceError(t('auth.selfRegisterDisabled'), 'self_register_disabled');
  }
  assertEmailDomainAllowed(input.email);
  if (!isStrongEnough(input.password)) {
    throw new AuthServiceError(t('auth.passwordRule'), 'weak_password', 'password');
  }

  const email = normalizeEmail(input.email);
  const passwordHash = await hashPassword(input.password);

  return withServiceTx(async (sql) => {
    const orgRes = await sql.query<{ id: string }>('SELECT id FROM organizations ORDER BY created_at LIMIT 1');
    const organizationId = orgRes.rows[0]?.id;
    if (!organizationId) throw new AuthServiceError('ยังไม่ได้ตั้งค่าองค์กรในระบบ', 'no_organization');

    const existing = await findProfileByEmail(sql, email);
    if (existing) {
      // ไม่บอกตรง ๆ ว่ามีอีเมลนี้อยู่แล้ว เพื่อกันการไล่เดารายชื่อผู้ใช้ (enumeration)
      throw new AuthServiceError(
        'ถ้าอีเมลนี้ใช้สมัครได้ เราได้ส่งอีเมลยืนยันให้แล้ว กรุณาตรวจกล่องจดหมาย',
        'registration_masked',
      );
    }

    const profileRes = await sql.query<{ id: string }>(
      `INSERT INTO profiles (organization_id, email, full_name, department, phone, status)
       VALUES ($1,$2,$3,$4,$5,'active') RETURNING id`,
      [organizationId, email, input.fullName.trim(), input.department ?? null, input.phone ?? null],
    );
    const profileId = profileRes.rows[0]!.id;

    await sql.query('INSERT INTO user_credentials (profile_id, password_hash) VALUES ($1,$2)', [
      profileId,
      passwordHash,
    ]);
    await sql.query(`INSERT INTO user_roles (profile_id, role_code, scope_type) VALUES ($1,'employee','organization')`, [
      profileId,
    ]);
    await sql.query('INSERT INTO notification_preferences (profile_id) VALUES ($1)', [profileId]);

    const verifyToken = await issueToken(sql, profileId, 'email_verify', VERIFY_TOKEN_HOURS * 3600_000);
    await enqueueNotification(sql, {
      eventType: 'auth.verify_email',
      channel: 'email',
      recipientProfileId: profileId,
      recipientAddress: email,
      payload: {
        subject: 'ยืนยันอีเมลเพื่อเริ่มใช้งานระบบจองห้องประชุม TNN',
        text: `สวัสดีคุณ ${input.fullName}\n\nกดลิงก์ด้านล่างเพื่อยืนยันอีเมลของคุณ ลิงก์มีอายุ ${VERIFY_TOKEN_HOURS} ชั่วโมง`,
        link: `/verify-email?token=${verifyToken}`,
        data: { fullName: input.fullName },
      },
    });

    return { profileId, verifyToken };
  });
}

export async function verifyEmail(token: string): Promise<void> {
  await withServiceTx(async (sql) => {
    const profileId = await consumeToken(sql, token, 'email_verify');
    await sql.query(
      `UPDATE profiles SET email_verified_at = coalesce(email_verified_at, now()), status = 'active' WHERE id = $1`,
      [profileId],
    );
  });
}

// ------------------------------------------------------------
// เข้าสู่ระบบ
// ------------------------------------------------------------
export async function login(
  email: string,
  password: string,
  meta: { ipHint?: string | null; userAgent?: string | null } = {},
): Promise<SessionUser> {
  const normalized = normalizeEmail(email);

  const byEmail = await consumeRateLimit(`login:email:${normalized}`, LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_SECONDS);
  const byIp = meta.ipHint
    ? await consumeRateLimit(`login:ip:${meta.ipHint}`, LOGIN_MAX_ATTEMPTS * 3, LOGIN_WINDOW_SECONDS)
    : { allowed: true, remaining: 99, retryAfterSeconds: 0 };

  if (!byEmail.allowed || !byIp.allowed) {
    const minutes = Math.ceil(Math.max(byEmail.retryAfterSeconds, byIp.retryAfterSeconds) / 60);
    await auditStandalone({
      actorProfileId: null,
      actorEmail: normalized,
      action: 'auth.login_rate_limited',
      resourceType: 'auth',
      ipHint: meta.ipHint ?? null,
    });
    throw new AuthServiceError(t('auth.tooManyAttempts', { minutes }), 'rate_limited');
  }

  const result = await withServiceTx(async (sql) => {
    const profile = await findProfileByEmail(sql, normalized);
    const credRes = profile
      ? await sql.query<{ password_hash: string }>(
          'SELECT password_hash FROM user_credentials WHERE profile_id = $1',
          [profile.id],
        )
      : { rows: [] as { password_hash: string }[], rowCount: 0 };

    // เทียบรหัสผ่านเสมอ แม้ไม่พบผู้ใช้ เพื่อให้เวลาตอบกลับใกล้เคียงกัน (กัน timing attack)
    const storedHash = credRes.rows[0]?.password_hash ?? 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA';
    const passwordOk = await verifyPassword(password, storedHash);

    await sql.query('INSERT INTO login_attempts (email, ip_hint, succeeded) VALUES ($1,$2,$3)', [
      normalized,
      meta.ipHint ?? null,
      Boolean(profile) && passwordOk,
    ]);

    if (!profile || !passwordOk) return { kind: 'invalid' as const };
    if (profile.status === 'suspended' || profile.status === 'deactivated') return { kind: 'inactive' as const };

    const roles = await loadRoles(sql, profile.id);
    return { kind: 'ok' as const, user: toSessionUser(profile, roles) };
  });

  if (result.kind === 'invalid') throw new AuthServiceError(t('auth.invalidCredentials'), 'invalid_credentials');
  if (result.kind === 'inactive') throw new AuthServiceError(t('auth.accountInactive'), 'account_inactive');
  return result.user;
}

// ------------------------------------------------------------
// ลืมรหัสผ่าน / ตั้งรหัสผ่านใหม่
// ------------------------------------------------------------
export async function requestPasswordReset(email: string): Promise<void> {
  const normalized = normalizeEmail(email);
  const limit = await consumeRateLimit(`reset:${normalized}`, 5, 3600);
  if (!limit.allowed) throw new AuthServiceError(t('error.rateLimited'), 'rate_limited');

  await withServiceTx(async (sql) => {
    const profile = await findProfileByEmail(sql, normalized);
    // ตอบข้อความเดียวกันเสมอไม่ว่าอีเมลจะมีอยู่จริงหรือไม่ (กัน enumeration)
    if (!profile) return;
    const token = await issueToken(sql, profile.id, 'password_reset', RESET_TOKEN_MINUTES * 60_000);
    await enqueueNotification(sql, {
      eventType: 'auth.password_reset',
      channel: 'email',
      recipientProfileId: profile.id,
      recipientAddress: profile.email,
      payload: {
        subject: 'ตั้งรหัสผ่านใหม่ — ระบบจองห้องประชุม TNN',
        text: `มีคำขอตั้งรหัสผ่านใหม่สำหรับบัญชีนี้ ลิงก์มีอายุ ${RESET_TOKEN_MINUTES} นาที\nถ้าไม่ได้เป็นผู้ขอ ให้เพิกเฉยต่ออีเมลฉบับนี้`,
        link: `/reset-password?token=${token}`,
      },
    });
  });
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  if (!isStrongEnough(newPassword)) {
    throw new AuthServiceError(t('auth.passwordRule'), 'weak_password', 'password');
  }
  const passwordHash = await hashPassword(newPassword);
  await withServiceTx(async (sql) => {
    const profileId = await consumeToken(sql, token, 'password_reset');
    await sql.query(
      `INSERT INTO user_credentials (profile_id, password_hash, updated_at)
       VALUES ($1,$2,now())
       ON CONFLICT (profile_id) DO UPDATE SET password_hash = excluded.password_hash, updated_at = now()`,
      [profileId, passwordHash],
    );
    // เปลี่ยนรหัสผ่านแล้วต้องเตะทุกอุปกรณ์ออก
    await sql.query('UPDATE user_sessions SET revoked_at = now() WHERE profile_id = $1 AND revoked_at IS NULL', [
      profileId,
    ]);
  });
}

export async function changePassword(profileId: string, currentPassword: string, newPassword: string): Promise<void> {
  if (!isStrongEnough(newPassword)) {
    throw new AuthServiceError(t('auth.passwordRule'), 'weak_password', 'newPassword');
  }
  const newHash = await hashPassword(newPassword);
  await withServiceTx(async (sql) => {
    const res = await sql.query<{ password_hash: string }>(
      'SELECT password_hash FROM user_credentials WHERE profile_id = $1',
      [profileId],
    );
    const stored = res.rows[0]?.password_hash;
    if (!stored || !(await verifyPassword(currentPassword, stored))) {
      throw new AuthServiceError('รหัสผ่านปัจจุบันไม่ถูกต้อง', 'invalid_current_password', 'currentPassword');
    }
    await sql.query('UPDATE user_credentials SET password_hash = $2, updated_at = now() WHERE profile_id = $1', [
      profileId,
      newHash,
    ]);
  });
}

// ------------------------------------------------------------
// เชิญผู้ใช้โดยผู้ดูแลระบบ
// ------------------------------------------------------------
export async function inviteUser(input: {
  email: string;
  fullName: string;
  department?: string | null;
  roleCode: RoleCode;
  invitedBy: string;
}): Promise<{ profileId: string; inviteToken: string }> {
  const email = normalizeEmail(input.email);
  return withServiceTx(async (sql) => {
    const orgRes = await sql.query<{ id: string }>('SELECT id FROM organizations ORDER BY created_at LIMIT 1');
    const organizationId = orgRes.rows[0]?.id;
    if (!organizationId) throw new AuthServiceError('ยังไม่ได้ตั้งค่าองค์กรในระบบ', 'no_organization');

    const existing = await findProfileByEmail(sql, email);
    if (existing) throw new AuthServiceError('อีเมลนี้มีบัญชีอยู่แล้วในระบบ', 'email_exists', 'email');

    const profileRes = await sql.query<{ id: string }>(
      `INSERT INTO profiles (organization_id, email, full_name, department, status)
       VALUES ($1,$2,$3,$4,'invited') RETURNING id`,
      [organizationId, email, input.fullName.trim(), input.department ?? null],
    );
    const profileId = profileRes.rows[0]!.id;
    await sql.query('INSERT INTO user_roles (profile_id, role_code, scope_type, granted_by) VALUES ($1,$2,$3,$4)', [
      profileId,
      input.roleCode,
      'organization',
      input.invitedBy,
    ]);
    await sql.query('INSERT INTO notification_preferences (profile_id) VALUES ($1)', [profileId]);

    const inviteToken = await issueToken(sql, profileId, 'invite', 7 * 24 * 3600_000);
    await enqueueNotification(sql, {
      eventType: 'auth.invite',
      channel: 'email',
      recipientProfileId: profileId,
      recipientAddress: email,
      payload: {
        subject: 'คำเชิญเข้าใช้งานระบบจองห้องประชุม TNN',
        text: `คุณได้รับเชิญให้ใช้งานระบบจองห้องประชุม TNN กดลิงก์เพื่อตั้งรหัสผ่านและเริ่มใช้งาน (ลิงก์มีอายุ 7 วัน)`,
        link: `/accept-invite?token=${inviteToken}`,
      },
    });
    return { profileId, inviteToken };
  });
}

/** ผู้ถูกเชิญตั้งรหัสผ่านครั้งแรก */
export async function acceptInvite(token: string, password: string): Promise<void> {
  if (!isStrongEnough(password)) throw new AuthServiceError(t('auth.passwordRule'), 'weak_password', 'password');
  const passwordHash = await hashPassword(password);
  await withServiceTx(async (sql) => {
    const profileId = await consumeToken(sql, token, 'invite');
    await sql.query(
      `INSERT INTO user_credentials (profile_id, password_hash) VALUES ($1,$2)
       ON CONFLICT (profile_id) DO UPDATE SET password_hash = excluded.password_hash, updated_at = now()`,
      [profileId, passwordHash],
    );
    await sql.query(
      `UPDATE profiles SET status = 'active', email_verified_at = coalesce(email_verified_at, now()) WHERE id = $1`,
      [profileId],
    );
  });
}
