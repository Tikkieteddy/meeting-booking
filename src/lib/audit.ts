import 'server-only';
import type { Sql } from '@/lib/db/pool';
import { withServiceTx } from '@/lib/db/pool';
import { logger } from '@/lib/util/logger';

/**
 * Audit Log — บรีฟข้อ 11
 * เก็บผู้กระทำ เวลา action resource ค่าเดิม ค่าใหม่ IP (ปกปิดบางส่วน) และ correlation id
 * ตารางนี้ไม่มี policy สำหรับ UPDATE/DELETE จึงแก้ไขย้อนหลังไม่ได้
 */
export type AuditEntry = {
  actorProfileId: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  before?: unknown;
  after?: unknown;
  ipHint?: string | null;
  userAgent?: string | null;
  correlationId?: string | null;
};

const SENSITIVE_FIELDS = ['password', 'password_hash', 'token', 'token_hash', 'secret', 'link_code'];

/** ตัดฟิลด์อ่อนไหวออกก่อนบันทึก เพื่อไม่ให้ความลับตกลงไปอยู่ใน log */
export function sanitize(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map(sanitize);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_FIELDS.includes(k.toLowerCase()) ? '[REDACTED]' : sanitize(v);
    }
    return out;
  }
  return value;
}

/** บันทึกภายใน transaction ที่กำลังทำงานอยู่ (แนะนำ — ได้ atomicity กับงานหลัก) */
export async function writeAudit(sql: Sql, entry: AuditEntry): Promise<void> {
  await sql.query(
    `INSERT INTO audit_logs
       (actor_profile_id, actor_email, actor_role, action, resource_type, resource_id,
        before_data, after_data, ip_hint, user_agent, correlation_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      entry.actorProfileId,
      entry.actorEmail ?? null,
      entry.actorRole ?? null,
      entry.action,
      entry.resourceType,
      entry.resourceId ?? null,
      entry.before === undefined ? null : JSON.stringify(sanitize(entry.before)),
      entry.after === undefined ? null : JSON.stringify(sanitize(entry.after)),
      entry.ipHint ?? null,
      entry.userAgent ?? null,
      entry.correlationId ?? null,
    ],
  );
}

/** บันทึกแยก transaction — ใช้เมื่อเหตุการณ์เกิดนอก transaction หลัก (เช่น login ล้มเหลว) */
export async function auditStandalone(entry: AuditEntry): Promise<void> {
  try {
    await withServiceTx((sql) => writeAudit(sql, entry));
  } catch (error) {
    // audit ล้มเหลวต้องไม่ทำให้ธุรกรรมหลักพัง แต่ต้องเห็นใน log
    logger.error('บันทึก audit log ไม่สำเร็จ', { action: entry.action, error: (error as Error).message });
  }
}
