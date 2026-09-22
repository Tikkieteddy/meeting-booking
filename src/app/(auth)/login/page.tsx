import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/auth/auth-forms';
import { getSessionUser } from '@/lib/auth/current-user';
import { env } from '@/lib/env';
import { t } from '@/lib/i18n';

export const metadata = { title: t('auth.login') };
/*
 * ต้องประกอบหน้าตอนมีคนเรียก ไม่ใช่ตอน build
 * หน้านี้อ่านค่าตั้งค่า (env) ซึ่งตอน build บน Vercel Preview ไม่มีให้อ่าน
 * ถ้าปล่อยให้ประกอบล่วงหน้า build จะพังทั้งชุดตั้งแต่หน้านี้หน้าเดียว
 */
export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  if (await getSessionUser()) redirect('/calendar');
  return <LoginForm rememberDays={env().AUTH_REMEMBER_DAYS} />;
}
