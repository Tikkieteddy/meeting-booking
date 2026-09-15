import { ping } from '@/lib/db/pool';
import { apiOk, apiError } from '@/lib/api/respond';
import { env } from '@/lib/env';

/**
 * Health check สำหรับ uptime monitor (บรีฟ 22.11)
 * ไม่เปิดเผยค่า secret หรือรายละเอียดภายในระบบ
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  const started = Date.now();
  try {
    const dbOk = await ping();
    return apiOk({
      status: dbOk ? 'ok' : 'degraded',
      database: dbOk ? 'ok' : 'down',
      release: env().RELEASE_VERSION,
      env: env().APP_ENV,
      latencyMs: Date.now() - started,
      checkedAt: new Date().toISOString(),
    });
  } catch {
    return apiError('unhealthy', 'ระบบไม่พร้อมให้บริการ', 503);
  }
}
