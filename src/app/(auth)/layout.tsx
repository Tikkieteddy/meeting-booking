import Link from 'next/link';
import { t } from '@/lib/i18n';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-gradient-to-b from-brand-50 via-ink-50 to-ink-50 px-4 py-10">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-6 flex items-center justify-center gap-2.5" aria-label={t('app.name')}>
          <span className="flex size-10 items-center justify-center rounded-xl bg-brand-500 text-lg font-bold text-white">
            T
          </span>
          <span className="text-lg font-semibold text-ink-900">{t('app.name')}</span>
        </Link>
        <div className="card p-6 sm:p-8">{children}</div>
        <p className="mt-6 text-center text-xs text-ink-500">
          ระบบภายในองค์กร · ใช้อีเมลองค์กรในการเข้าใช้งาน
        </p>
      </div>
    </main>
  );
}
