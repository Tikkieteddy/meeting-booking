import 'server-only';
import type { Sql } from '@/lib/db/pool';

/**
 * ค่าตั้งค่าระดับองค์กร แก้ได้จากหน้า Admin โดยไม่ต้องแก้โค้ด (บรีฟ AC06)
 * ถ้ายังไม่เคยตั้งค่า จะใช้ค่าปริยายในไฟล์นี้
 */
export const SETTING_DEFAULTS = {
  'booking.horizon_days': 90,
  'booking.allow_external_guests': true,
  'booking.default_privacy': 'public',
  'booking.min_lead_minutes': 0,
  'waitlist.offer_minutes': 30,
  'auth.self_register': true,
  'auth.allowed_email_domains': [] as string[],
  'tutorial.enabled': true,
  'report.retention_days': 730,
  'audit.retention_days': 730,
  'calendar.default_view': 'day',
  'calendar.week_starts_on': 1,
} as const;

export type SettingKey = keyof typeof SETTING_DEFAULTS;

export async function getSettings(sql: Sql, organizationId: string): Promise<Record<string, unknown>> {
  const res = await sql.query<{ key: string; value: unknown }>(
    'SELECT key, value FROM app_settings WHERE organization_id = $1',
    [organizationId],
  );
  const out: Record<string, unknown> = { ...SETTING_DEFAULTS };
  for (const row of res.rows) out[row.key] = row.value;
  return out;
}

export async function getSetting<K extends SettingKey>(
  sql: Sql,
  organizationId: string,
  key: K,
): Promise<(typeof SETTING_DEFAULTS)[K]> {
  const res = await sql.query<{ value: unknown }>(
    'SELECT value FROM app_settings WHERE organization_id = $1 AND key = $2',
    [organizationId, key],
  );
  const row = res.rows[0];
  return (row ? (row.value as (typeof SETTING_DEFAULTS)[K]) : SETTING_DEFAULTS[key]);
}

export async function setSetting(
  sql: Sql,
  organizationId: string,
  key: string,
  value: unknown,
  updatedBy: string | null,
): Promise<void> {
  await sql.query(
    `INSERT INTO app_settings (organization_id, key, value, updated_by, updated_at)
     VALUES ($1, $2, $3::jsonb, $4, now())
     ON CONFLICT (organization_id, key)
     DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = now()`,
    [organizationId, key, JSON.stringify(value), updatedBy],
  );
}
