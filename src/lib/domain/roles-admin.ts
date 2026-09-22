import 'server-only';
import { asService, withTx, type DbContext } from '@/lib/db/pool';
import { writeAudit } from '@/lib/audit';
import { DomainError, ForbiddenError, NotFoundError } from '@/lib/domain/errors';
import { ALL_ROLES, canDisableRole, type RoleCode } from '@/lib/rbac/permissions';

type Ctx = DbContext;
type Actor = { profileId: string; email?: string | null; ipHint?: string | null };

export type RoleSetting = {
  code: RoleCode;
  nameTh: string;
  nameEn: string;
  rank: number;
  /** false = ซ่อนจากรายการให้เลือก (ผู้ที่ถืออยู่แล้วยังใช้สิทธิ์ได้ตามเดิม) */
  enabled: boolean;
  /** จำนวนคนที่ถือบทบาทนี้อยู่ตอนนี้ */
  assignedCount: number;
  /** บทบาทหลักของระบบจะปิดไม่ได้ */
  canDisable: boolean;
};

function isRoleCode(value: string): value is RoleCode {
  return (ALL_ROLES as readonly string[]).includes(value);
}

/** รายการบทบาททั้งหมดพร้อมสถานะเปิด/ปิด และจำนวนผู้ถือ */
export async function listRoleSettings(ctx: Ctx): Promise<RoleSetting[]> {
  return withTx(ctx, async (sql) => {
    /*
     * การนับผู้ถือบทบาทต้องอ่าน user_roles ของผู้อื่น ซึ่ง RLS เปิดให้อ่าน
     * เฉพาะแถวของตัวเอง (migration 007) เส้นทางนี้ผ่านการตรวจ role:manage
     * มาแล้ว จึงยกระดับสิทธิ์เฉพาะคำสั่งนับนี้ และไม่รับข้อมูลจากผู้ใช้เลย
     */
    const counts = await asService(sql, async () => {
      const res = await sql.query<{ role_code: string; total: string }>(
        'SELECT role_code, count(DISTINCT profile_id)::text AS total FROM user_roles GROUP BY role_code',
      );
      return new Map(res.rows.map((r) => [r.role_code, Number(r.total)]));
    });

    const res = await sql.query<{
      code: string;
      name_th: string;
      name_en: string;
      rank: number;
      enabled: boolean;
    }>('SELECT code, name_th, name_en, rank, enabled FROM roles ORDER BY rank DESC');

    return res.rows
      .filter((r) => isRoleCode(r.code))
      .map((r) => ({
        code: r.code as RoleCode,
        nameTh: r.name_th,
        nameEn: r.name_en,
        rank: r.rank,
        enabled: r.enabled,
        assignedCount: counts.get(r.code) ?? 0,
        canDisable: canDisableRole(r.code as RoleCode),
      }));
  });
}

/** รหัสบทบาทที่ยังเปิดใช้งาน — ใช้กรองรายการให้เลือกในหน้าจัดการผู้ใช้ */
export async function listEnabledRoleCodes(ctx: Ctx): Promise<RoleCode[]> {
  return withTx(ctx, async (sql) => {
    const res = await sql.query<{ code: string }>('SELECT code FROM roles WHERE enabled ORDER BY rank DESC');
    return res.rows.map((r) => r.code).filter(isRoleCode);
  });
}

/**
 * เปิดหรือปิดการใช้งานบทบาท
 *
 * ปิดแล้วจะหายจากรายการให้เลือกเท่านั้น ไม่ตัดสิทธิ์ผู้ที่ถืออยู่แล้ว
 * เพราะการตัดสิทธิ์เงียบ ๆ จะทำให้คนทำงานค้างกลางทางโดยไม่รู้สาเหตุ
 */
export async function setRoleEnabled(
  ctx: Ctx,
  actor: Actor,
  code: RoleCode,
  enabled: boolean,
): Promise<RoleSetting[]> {
  if (!enabled && !canDisableRole(code)) {
    throw new DomainError('บทบาทนี้ปิดการใช้งานไม่ได้ เพราะเป็นบทบาทหลักของระบบ', 'core_role', 409);
  }

  await withTx(ctx, async (sql) => {
    const before = await sql.query<{ enabled: boolean }>('SELECT enabled FROM roles WHERE code = $1', [code]);
    if (before.rowCount === 0) throw new NotFoundError('ไม่พบบทบาทนี้ในระบบ');

    // RLS ของตาราง roles เปิดให้ผู้มีสิทธิ์ role:manage แก้ได้เฉพาะคอลัมน์ enabled
    // (migration 008) ถ้าสิทธิ์ไม่ถึง UPDATE จะไม่ error แต่จะแก้ได้ 0 แถว
    const res = await sql.query('UPDATE roles SET enabled = $2 WHERE code = $1', [code, enabled]);
    if (res.rowCount === 0) throw new ForbiddenError('ไม่มีสิทธิ์เปลี่ยนสถานะบทบาท');

    await writeAudit(sql, {
      actorProfileId: actor.profileId,
      actorEmail: actor.email ?? null,
      action: enabled ? 'role.enable' : 'role.disable',
      resourceType: 'role',
      resourceId: code,
      before: { enabled: before.rows[0]!.enabled },
      after: { enabled },
      ipHint: actor.ipHint ?? null,
    });
  });

  return listRoleSettings(ctx);
}
