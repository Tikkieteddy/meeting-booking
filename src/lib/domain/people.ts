import 'server-only';
import { asService, withTx, type DbContext } from '@/lib/db/pool';

export type Person = {
  id: string;
  fullName: string;
  email: string;
  department: string | null;
  /** ผูก LINE ไว้และเปิดรับแจ้งเตือนทาง LINE — ระบบส่งเตือนทางไลน์ให้ได้ */
  lineReady: boolean;
  /** เปิดรับแจ้งเตือนทางอีเมล */
  emailReady: boolean;
};

/**
 * ค้นหาคนในองค์กรสำหรับช่อง "ผู้เข้าร่วม" ในฟอร์มจอง
 *
 * RLS ของ profiles เปิดให้อ่านได้เฉพาะแถวของตัวเอง จึงต้องยกระดับสิทธิ์ตรงนี้
 * เหตุผลที่ยอมรับได้: เป็นงานเดียวกับ "จับคู่ผู้เข้าร่วมกับบัญชี" ที่ระบบทำอยู่แล้ว
 * แค่ย้ายมาทำก่อนกดจอง เพื่อให้ผู้จองเลือกจากรายชื่อแทนการพิมพ์อีเมลเอง
 * ขอบเขตที่จำกัดไว้: ต้องล็อกอิน · ค้นได้เฉพาะบัญชีที่ใช้งานอยู่ · ต้องพิมพ์อย่างน้อย 2 ตัว
 * · คืนไม่เกิน 8 คน · คืนเฉพาะชื่อ อีเมล แผนก และสถานะพร้อมรับแจ้งเตือน (ไม่มีข้อมูลอื่น)
 */
export async function searchPeople(ctx: DbContext, query: string): Promise<Person[]> {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  return withTx(ctx, (sql) =>
    asService(sql, async () => {
      const res = await sql.query<{
        id: string;
        full_name: string;
        email: string;
        department: string | null;
        line_ready: boolean;
        email_ready: boolean;
      }>(
        `SELECT p.id, p.full_name, p.email, p.department,
                (ll.status = 'linked' AND ll.line_user_id IS NOT NULL AND coalesce(np.line_enabled, false)) AS line_ready,
                coalesce(np.email_enabled, true) AS email_ready
           FROM profiles p
           LEFT JOIN line_links ll ON ll.profile_id = p.id
           LEFT JOIN notification_preferences np ON np.profile_id = p.id
          WHERE p.status = 'active'
            AND p.id <> $2
            AND (lower(p.full_name) LIKE '%' || $1 || '%'
                 OR lower(p.email) LIKE '%' || $1 || '%'
                 OR lower(coalesce(p.department, '')) LIKE '%' || $1 || '%')
          ORDER BY (lower(p.full_name) LIKE $1 || '%') DESC, p.full_name
          LIMIT 8`,
        [q, ctx.userId],
      );
      return res.rows.map((r) => ({
        id: r.id,
        fullName: r.full_name,
        email: r.email,
        department: r.department,
        lineReady: Boolean(r.line_ready),
        emailReady: Boolean(r.email_ready),
      }));
    }),
  );
}
