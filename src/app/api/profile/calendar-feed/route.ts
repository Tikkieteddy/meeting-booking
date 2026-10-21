import { requireUser } from '@/lib/auth/current-user';
import { createFeedToken, getFeedStatus, revokeFeedToken } from '@/lib/domain/calendar-feed';
import { apiOk, withApi } from '@/lib/api/respond';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

/** ลิงก์ปฏิทินส่วนตัวของผู้ที่ล็อกอินอยู่เท่านั้น (ไม่มีทางจัดการลิงก์ของคนอื่น — RLS บังคับซ้ำ) */
export const GET = withApi(async () => {
  const user = await requireUser();
  return apiOk({ feed: await getFeedStatus({ userId: user.id, role: 'authenticated' }, user.id) });
});

/** สร้างลิงก์ใหม่ — ลิงก์เดิม (ถ้ามี) ใช้ไม่ได้ทันที ลิงก์ดิบส่งกลับครั้งเดียว */
export const POST = withApi(async () => {
  const user = await requireUser();
  const ctx = { userId: user.id, role: 'authenticated' as const };
  const token = await createFeedToken(ctx, { profileId: user.id, email: user.email });
  const url = `${env().NEXT_PUBLIC_APP_URL.replace(/\/$/, '')}/api/calendar-feed/${token}.ics`;
  return apiOk(
    {
      url,
      // webcal:// เปิดโปรแกรมปฏิทินบนเครื่อง (Outlook บน Windows/Mac, ปฏิทินของ iPhone) ให้สมัครรับทันที
      webcalUrl: url.replace(/^https?:\/\//, 'webcal://'),
      feed: await getFeedStatus(ctx, user.id),
    },
    { status: 201 },
  );
});

export const DELETE = withApi(async () => {
  const user = await requireUser();
  const ctx = { userId: user.id, role: 'authenticated' as const };
  await revokeFeedToken(ctx, { profileId: user.id, email: user.email });
  return apiOk({ feed: await getFeedStatus(ctx, user.id) });
});
