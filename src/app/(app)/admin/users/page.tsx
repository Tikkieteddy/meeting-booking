import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/current-user";
import { asService, withTx } from "@/lib/db/pool";
import { UserManager, type AdminUser } from "@/components/admin/user-manager";
import { t } from "@/lib/i18n";

export const metadata = { title: t("nav.users") };
export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.permissions.includes("user:read")) redirect("/calendar");

  // หน้านี้ผ่านการตรวจ user:read แล้ว จึงอ่าน role ของผู้อื่นด้วยสิทธิ์ระบบ
  const users = await withTx(
    { userId: user.id, role: "authenticated" },
    async (sql) =>
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
         FROM profiles p ORDER BY p.full_name LIMIT 300`,
        );
        return res.rows.map<AdminUser>((r) => ({
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

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 overflow-y-auto p-4 sm:p-6">
      <UserManager
        users={users}
        canManageRoles={user.permissions.includes("role:manage")}
      />
    </div>
  );
}
