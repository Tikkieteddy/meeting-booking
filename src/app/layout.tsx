import type { Metadata, Viewport } from 'next';
import { ToastProvider } from '@/components/ui/toast';
import { t } from '@/lib/i18n';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: t('app.name'),
    template: `%s · ${t('app.shortName')}`,
  },
  description: t('app.tagline'),
  robots: { index: false, follow: false }, // ระบบภายในองค์กร ไม่ให้ search engine เก็บ
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5, // ต้องให้ซูมได้ถึง 200% (บรีฟข้อ 12)
  themeColor: '#EC5F27',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body className="min-h-dvh bg-ink-50 text-ink-800 antialiased">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
