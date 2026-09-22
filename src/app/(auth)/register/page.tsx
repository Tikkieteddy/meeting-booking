import { RegisterForm } from '@/components/auth/auth-forms';
import { env } from '@/lib/env';
import { t } from '@/lib/i18n';

export const metadata = { title: t('auth.register') };
/*
 * ต้องประกอบหน้าตอนมีคนเรียก ไม่ใช่ตอน build
 * หน้านี้อ่านค่าตั้งค่า (env) ซึ่งตอน build บน Vercel Preview ไม่มีให้อ่าน
 * ถ้าปล่อยให้ประกอบล่วงหน้า build จะพังทั้งชุดตั้งแต่หน้านี้หน้าเดียว
 */
export const dynamic = 'force-dynamic';

export default function RegisterPage() {
  if (!env().AUTH_ALLOW_SELF_REGISTER) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-xl font-semibold text-ink-900">{t('auth.register')}</h1>
        <p className="text-sm text-ink-600">{t('auth.selfRegisterDisabled')}</p>
      </div>
    );
  }
  return <RegisterForm />;
}
