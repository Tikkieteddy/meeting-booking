import Link from 'next/link';
import { verifyEmail } from '@/lib/auth/service';
import { t } from '@/lib/i18n';

export const metadata = { title: t('auth.verifyEmail') };

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  let ok = false;
  let message = 'ลิงก์ยืนยันไม่ถูกต้อง';

  if (token) {
    try {
      await verifyEmail(token);
      ok = true;
    } catch (error) {
      message = error instanceof Error ? error.message : message;
    }
  }

  return (
    <div className="flex flex-col gap-4 text-center">
      <span aria-hidden="true" className="text-4xl">
        {ok ? '✅' : '⚠️'}
      </span>
      <h1 className="text-xl font-semibold text-ink-900">{ok ? t('auth.verifyEmailSuccess') : t('auth.verifyEmail')}</h1>
      {!ok && <p className="text-sm text-ink-600">{message}</p>}
      <Link
        href="/login"
        className="mx-auto inline-flex h-11 items-center rounded-xl bg-brand-500 px-5 text-sm font-medium text-white hover:bg-brand-600"
      >
        {t('auth.login')}
      </Link>
    </div>
  );
}
