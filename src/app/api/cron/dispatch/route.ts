import { assertCronAuthorized } from '@/lib/api/cron-auth';
import { dispatchNotifications } from '@/lib/notify/worker';
import { apiOk, withApi } from '@/lib/api/respond';

/** ส่งการแจ้งเตือนในคิว — ตั้ง Vercel Cron ให้เรียกทุก 5 นาที */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const GET = withApi(async (request: Request) => {
  assertCronAuthorized(request);
  const summary = await dispatchNotifications();
  return apiOk({ ...summary, ranAt: new Date().toISOString() });
});

export const POST = GET;
