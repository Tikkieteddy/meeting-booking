import 'server-only';
import { withServiceTx, withTx, type DbContext } from '@/lib/db/pool';
import { newLinkCode } from '@/lib/auth/tokens';
import { logger } from '@/lib/util/logger';

/**
 * เชื่อมบัญชี LINE แบบยินยอม ด้วยรหัสใช้ครั้งเดียวที่หมดอายุได้ (บรีฟ 22.7)
 * ป้องกันการผูกผิดคน: รหัสสุ่ม 8 ตัว อายุ 15 นาที และใช้ได้ครั้งเดียว
 */
export const LINK_CODE_MINUTES = 15;

export async function createLineLinkCode(ctx: DbContext, profileId: string): Promise<{ code: string; expiresAt: Date }> {
  const code = newLinkCode();
  const expiresAt = new Date(Date.now() + LINK_CODE_MINUTES * 60_000);
  await withTx(ctx, (sql) =>
    sql.query(
      `INSERT INTO line_links (profile_id, status, link_code, code_expires_at, updated_at)
       VALUES ($1, 'pending', $2, $3, now())
       ON CONFLICT (profile_id) DO UPDATE
         SET status = CASE WHEN line_links.status = 'linked' THEN 'linked' ELSE 'pending' END,
             link_code = excluded.link_code,
             code_expires_at = excluded.code_expires_at,
             updated_at = now()`,
      [profileId, code, expiresAt],
    ),
  );
  return { code, expiresAt };
}

export async function unlinkLine(ctx: DbContext, profileId: string): Promise<void> {
  await withTx(ctx, (sql) =>
    sql.query(
      `UPDATE line_links
          SET status = 'unlinked', line_user_id = NULL, link_code = NULL,
              code_expires_at = NULL, unlinked_at = now(), updated_at = now()
        WHERE profile_id = $1`,
      [profileId],
    ),
  );
}

/** ผูกบัญชีจากรหัสที่ผู้ใช้พิมพ์เข้ามาในแชต LINE */
export async function consumeLinkCode(code: string, lineUserId: string): Promise<{ linked: boolean; profileId?: string }> {
  return withServiceTx(async (sql) => {
    // กันกรณี LINE user id นี้เคยผูกกับบัญชีอื่นไว้
    await sql.query(
      `UPDATE line_links SET line_user_id = NULL, status = 'unlinked', unlinked_at = now()
        WHERE line_user_id = $1`,
      [lineUserId],
    );
    const res = await sql.query<{ profile_id: string }>(
      `UPDATE line_links
          SET line_user_id = $2, status = 'linked', linked_at = now(),
              link_code = NULL, code_expires_at = NULL, updated_at = now()
        WHERE upper(link_code) = upper($1) AND code_expires_at > now()
        RETURNING profile_id`,
      [code.trim(), lineUserId],
    );
    const profileId = res.rows[0]?.profile_id;
    if (!profileId) return { linked: false };

    // เปิดช่องทาง LINE ให้อัตโนมัติเมื่อผูกสำเร็จ (ถือเป็นการยินยอมชัดเจน)
    await sql.query(
      `INSERT INTO notification_preferences (profile_id, line_enabled)
       VALUES ($1, true)
       ON CONFLICT (profile_id) DO UPDATE SET line_enabled = true, updated_at = now()`,
      [profileId],
    );
    return { linked: true, profileId };
  });
}

/** ผู้ใช้บล็อกหรือเลิกติดตามบัญชีทางการ -> หยุดส่งทันที */
export async function markLineBlocked(lineUserId: string): Promise<void> {
  await withServiceTx(async (sql) => {
    const res = await sql.query<{ profile_id: string }>(
      `UPDATE line_links SET status = 'blocked', updated_at = now() WHERE line_user_id = $1 RETURNING profile_id`,
      [lineUserId],
    );
    const profileId = res.rows[0]?.profile_id;
    if (profileId) {
      await sql.query('UPDATE notification_preferences SET line_enabled = false, updated_at = now() WHERE profile_id = $1', [
        profileId,
      ]);
      logger.info('ผู้ใช้บล็อกบัญชี LINE ของระบบ จึงปิดช่องทาง LINE ให้อัตโนมัติ', { profileId });
    }
  });
}
