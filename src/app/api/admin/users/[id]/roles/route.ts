import { z } from "zod";
import { asService, withTx } from "@/lib/db/pool";
import { writeAudit } from "@/lib/audit";
import { currentActor } from "@/lib/api/actor";
import { requirePermission } from "@/lib/auth/current-user";
import { apiOk, withApi } from "@/lib/api/respond";
import { ALL_ROLES } from "@/lib/rbac/permissions";
import { DomainError } from "@/lib/domain/errors";

const bodySchema = z.object({
  roles: z
    .array(
      z.object({
        roleCode: z.enum([
          "super_admin",
          "room_admin",
          "approver",
          "employee",
          "viewer",
        ]),
        scopeType: z
          .enum(["organization", "building", "room", "department"])
          .default("organization"),
        scopeId: z.string().max(100).optional().nullable(),
      }),
    )
    .max(20),
  status: z.enum(["invited", "active", "suspended", "deactivated"]).optional(),
});

export const PUT = withApi(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const admin = await requirePermission("role:manage");
    const { id } = await context.params;
    const { actor, ctx } = await currentActor();
    const body = bodySchema.parse(await request.json());

    await withTx(ctx, async (sql) => {
      // ตาราง user_roles เขียนได้เฉพาะสิทธิ์ระบบตาม RLS (migration 007)
      // เส้นทางนี้ผ่านการตรวจ role:manage แล้ว จึงยกระดับเฉพาะคำสั่งในบล็อกนี้
      // และบันทึก audit log ทุกครั้ง
      await asService(sql, async () => {
        const before = await sql.query<{
          role_code: string;
          scope_type: string;
          scope_id: string | null;
        }>(
          "SELECT role_code, scope_type, scope_id FROM user_roles WHERE profile_id = $1",
          [id],
        );

        // กันไม่ให้ระบบเหลือ super admin เป็นศูนย์
        const removingOwnSuperAdmin =
          id === admin.id &&
          before.rows.some((r) => r.role_code === "super_admin") &&
          !body.roles.some((r) => r.roleCode === "super_admin");
        if (removingOwnSuperAdmin) {
          const others = await sql.query<{ count: string }>(
            `SELECT count(*)::text AS count FROM user_roles WHERE role_code = 'super_admin' AND profile_id <> $1`,
            [id],
          );
          if (Number(others.rows[0]?.count ?? 0) === 0) {
            throw new DomainError(
              "ต้องมีผู้ดูแลระบบสูงสุดอย่างน้อยหนึ่งคน",
              "last_super_admin",
              409,
            );
          }
        }

        /*
         * บทบาทที่ผู้ดูแลระบบ "ปิดการใช้งาน" ไว้ (migration 008) จะมอบให้คนใหม่ไม่ได้
         * แต่คนที่ถืออยู่แล้วให้คงไว้ได้ ไม่อย่างนั้นการปิดบทบาทจะกลายเป็นการ
         * ตัดสิทธิ์ย้อนหลังโดยที่ผู้ดูแลระบบไม่ได้สั่ง
         */
        const enabledRows = await sql.query<{ code: string }>(
          "SELECT code FROM roles WHERE enabled",
        );
        const enabled = new Set(enabledRows.rows.map((r) => r.code));
        const held = new Set(before.rows.map((r) => r.role_code));
        const blocked = body.roles
          .map((r) => r.roleCode)
          .filter((code) => !enabled.has(code) && !held.has(code));
        if (blocked.length > 0) {
          throw new DomainError(
            "บทบาทที่เลือกถูกปิดการใช้งานไว้ กรุณาเปิดใช้งานที่หน้าบทบาทและสิทธิ์ก่อน",
            "role_disabled",
            409,
          );
        }

        await sql.query("DELETE FROM user_roles WHERE profile_id = $1", [id]);
        for (const role of body.roles) {
          if (!ALL_ROLES.includes(role.roleCode)) continue;
          await sql.query(
            `INSERT INTO user_roles (profile_id, role_code, scope_type, scope_id, granted_by)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (profile_id, role_code, scope_type, coalesce(scope_id, '')) DO NOTHING`,
            [
              id,
              role.roleCode,
              role.scopeType,
              role.scopeId ?? null,
              actor.profileId,
            ],
          );
        }
        if (body.status) {
          await sql.query("UPDATE profiles SET status = $2 WHERE id = $1", [
            id,
            body.status,
          ]);
        }

        await writeAudit(sql, {
          actorProfileId: actor.profileId,
          actorEmail: actor.email,
          action: "role.grant",
          resourceType: "profile",
          resourceId: id,
          before: before.rows,
          after: { roles: body.roles, status: body.status },
          ipHint: actor.ipHint,
        });
      });
    });

    return apiOk({ ok: true });
  },
);
