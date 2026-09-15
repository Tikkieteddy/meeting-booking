import Link from 'next/link';
import { ResetPasswordForm } from '@/components/auth/auth-forms';
import { t } from '@/lib/i18n';

export const metadata = { title: t('auth.resetPassword') };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  if (!token) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-xl font-semibold text-ink-900">{t('auth.resetPassword')}</h1>
        <p className="text-sm text-ink-600">ลิงก์ไม่ถูกต้องหรือหมดอายุ กรุณาขอลิงก์ใหม่</p>
        <Link href="/forgot-password" className="text-sm text-brand-700 underline-offset-2 hover:underline">
          ขอลิงก์ตั้งรหัสผ่านใหม่
        </Link>
      </div>
    );
  }
  return <ResetPasswordForm token={token} />;
}
