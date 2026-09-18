import type { Metadata, Viewport } from 'next';
import { ToastProvider } from '@/components/ui/toast';
import { RegisterServiceWorker } from '@/components/pwa/register-service-worker';
import { t } from '@/lib/i18n';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: t('app.name'),
    template: `%s · ${t('app.shortName')}`,
  },
  description: t('app.tagline'),
  robots: { index: false, follow: false }, // ระบบภายในองค์กร ไม่ให้ search engine เก็บ
  applicationName: t('app.shortName'),
  // ให้ iOS เปิดแบบเต็มจอเมื่อผู้ใช้เพิ่มลงหน้าจอโฮม (Safari ไม่อ่าน manifest ส่วนนี้)
  appleWebApp: {
    capable: true,
    title: t('app.shortName'),
    statusBarStyle: 'default',
  },
  /*
   * ต้องระบุ icon ปกติไว้ด้วย ไม่ใช่แค่ apple — เพราะการตั้ง metadata.icons
   * จะไปแทนที่การตรวจหาไฟล์ไอคอนอัตโนมัติของ Next ทั้งชุด ถ้าใส่แค่ apple
   * favicon บนแท็บเบราว์เซอร์จะหายไป
   */
  icons: {
    icon: [{ url: '/icon.png', sizes: '64x64', type: 'image/png' }],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5, // ต้องให้ซูมได้ถึง 200% (บรีฟข้อ 12)
  themeColor: '#EC5F27',
  // ไม่ตั้ง viewportFit: 'cover' โดยเจตนา — ค่านั้นทำให้เนื้อหาไหลไปอยู่ใต้ติ่งจอ
  // (notch) ซึ่งต้องทดสอบบนเครื่องจริงถึงจะยืนยันได้ว่าไม่บัง ปล่อยค่าเริ่มต้นไว้
  // iOS จะเว้นขอบให้เองอย่างปลอดภัย
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body className="min-h-dvh bg-ink-50 text-ink-800 antialiased">
        <ToastProvider>{children}</ToastProvider>
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
