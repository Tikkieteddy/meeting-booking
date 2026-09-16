import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/current-user";
import { listAmenities, listBuildings, listRooms } from "@/lib/domain/rooms";
import { asService, withTx } from "@/lib/db/pool";
import { RoomManager } from "@/components/admin/room-manager";
import { t } from "@/lib/i18n";

export const metadata = { title: t("nav.rooms") };
export const dynamic = "force-dynamic";

export default async function AdminRoomsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.permissions.includes("room:manage")) redirect("/calendar");
  const ctx = { userId: user.id, role: "authenticated" as const };

  const [rooms, amenities, buildings, approvers] = await Promise.all([
    listRooms(ctx, { includeArchived: true, includeInactive: true }),
    listAmenities(ctx),
    listBuildings(ctx),
    // ผ่านการตรวจ room:manage แล้ว — ค้นหาผู้ที่มีสิทธิ์อนุมัติต้องอ่าน user_roles ของผู้อื่น
    withTx(ctx, async (sql) =>
      asService(sql, async () => {
        const res = await sql.query<{ id: string; full_name: string }>(
          `SELECT DISTINCT p.id, p.full_name
           FROM profiles p JOIN user_roles ur ON ur.profile_id = p.id
          WHERE ur.role_code IN ('approver','room_admin','super_admin') AND p.status = 'active'
          ORDER BY p.full_name`,
        );
        return res.rows.map((r) => ({ id: r.id, fullName: r.full_name }));
      }),
    ),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 overflow-y-auto p-4 sm:p-6">
      <RoomManager
        rooms={rooms}
        amenities={amenities}
        buildings={buildings}
        approvers={approvers}
      />
    </div>
  );
}
