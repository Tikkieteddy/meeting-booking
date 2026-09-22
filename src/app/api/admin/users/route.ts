import { inviteUserSchema } from "@/lib/validation/schemas";
import { inviteUser } from "@/lib/auth/service";
import { asService, withTx } from "@/lib/db/pool";
import { currentActor } from "@/lib/api/actor";
import { requirePermission } from "@/lib/auth/current-user";
import { auditStandalone } from "@/lib/audit";
import { apiOk, withApi } from "@/lib/api/respond";
import { listEnabledRoleCodes } from "@/lib/domain/roles-admin";
import { DomainError } from "@/lib/domain/errors";

export const dynamic = "force-dynamic";

export const GET = withApi(async (request: Request) => {
  await requirePermission("user:read");
  const { ctx } = await currentActor();
  const search = new URL(request.url).searchParams.get("q") ?? "";

  // ผ่านการตรวจ user:read แล้ว — อ่านรายชื่อและ role ของผู้อื่นด้วยสิทธิ์ระบบ
  // เพราะ RLS ของ user_roles เปิดให้อ่านได้เฉพาะแถวของตัวเอง
  const users = await withTx(ctx, async (sql) =>
    asService(sql, async () => {
      const res = await sql.query<{
        id: string;
        email: string;
        full_name: string;
        department: string | null;
        status: string;
        last_login_at: Date | null;
        roles: string[] | null;
      }>(
        `SELECT p.id, p.email, p.full_name, p.department, p.status, p.last_login_at,
              (SELECT array_agg(ur.role_code) FROM user_roles ur WHERE ur.profile_id = p.id) AS roles
         FROM profiles p
        WHERE ($1 = '' OR p.full_name ILIKE '%' || $1 || '%' OR p.email ILIKE '%' || $1 || '%'
               OR coalesce(p.department,'') ILIKE '%' || $1 || '%')
        ORDER BY p.full_name
        LIMIT 200`,
        [search],
      );
      return res.rows.map((r) => ({
        id: r.id,
        email: r.email,
        fullName: r.full_name,
        department: r.department,
        status: r.status,
        lastLoginAt: r.last_login_at?.toISOString() ?? null,
        roles: r.roles ?? [],
      }));
    }),
  );

  return apiOk({ users });
});

export const POST = withApi(async (request: Request) => {
  const admin = await requirePermission("user:manage");
  const input = inviteUserSchema.parse(await request.json());

  // บทบาทที่ถูกปิดการใช้งานไว้ ห้ามใช้เชิญคนใหม่ (ดู migration 008)
  const { ctx } = await currentActor();
  const enabled = await listEnabledRoleCodes(ctx);
  if (!enabled.includes(input.roleCode)) {
    throw new DomainError(
      "บทบาทที่เลือกถูกปิดการใช้งานไว้ กรุณาเปิดใช้งานที่หน้าบทบาทและสิทธิ์ก่อน",
      "role_disabled",
      409,
    );
  }

  const result = await inviteUser({ ...input, invitedBy: admin.id });
  await auditStandalone({
    actorProfileId: admin.id,
    actorEmail: admin.email,
    action: "user.invite",
    resourceType: "profile",
    resourceId: result.profileId,
    after: { email: input.email, roleCode: input.roleCode },
  });
  // ไม่คืน invite token ให้ client — ผู้ถูกเชิญต้องรับจากอีเมลเท่านั้น
  return apiOk({ profileId: result.profileId }, { status: 201 });
});
