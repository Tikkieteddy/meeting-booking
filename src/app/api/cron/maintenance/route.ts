import { assertCronAuthorized } from '@/lib/api/cron-auth';
import { runMaintenance } from '@/lib/domain/maintenance';
import { withServiceTx } from '@/lib/db/pool';
import { getSetting } from '@/lib/settings';
import { apiOk, withApi } from '@/lib/api/respond';

/**
 * งานดูแลระบบ: ปล่อยห้องที่ไม่เช็กอิน ปิดงานที่ผ่านไปแล้ว จัดการคิวรอ และล้างข้อมูลหมดอายุ
 * ตั้ง Vercel Cron ให้เรียกทุก 10 นาที (เวลาในระบบคิดตาม Asia/Bangkok)
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const GET = withApi(async (request: Request) => {
  assertCronAuthorized(request);
  const retentionDays = await withServiceTx(async (sql) => {
    const org = await sql.query<{ id: string }>('SELECT id FROM organizations ORDER BY created_at LIMIT 1');
    const orgId = org.rows[0]?.id;
    return orgId ? getSetting(sql, orgId, 'audit.retention_days') : 730;
  });
  const summary = await runMaintenance({ auditRetentionDays: Number(retentionDays) });
  return apiOk({ ...summary, ranAt: new Date().toISOString() });
});

export const POST = GET;
