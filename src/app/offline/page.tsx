import { t } from '@/lib/i18n';

export const metadata = { title: t('offline.title') };

/**
 * หน้าที่แสดงเมื่อเปิดแอฟตอนไม่มีอินเทอร์เน็ต
 *
 * ต้องเป็นหน้า static ที่ไม่ต้องล็อกอินและไม่แตะฐานข้อมูล เพราะ service worker
 * เก็บหน้านี้ไว้ในเครื่องล่วงหน้า เพื่อเอามาแสดงตอนที่เรียกเซิร์ฟเวอร์ไม่ได้
 *
 * ไม่มี JavaScript ฝั่ง client เลย — ปุ่มเป็นลิงก์ธรรมดา เพื่อให้หน้านี้ทำงานได้
 * แน่นอนแม้ไฟล์ JavaScript จะโหลดไม่สำเร็จ
 */
export const dynamic = 'force-static';

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-ink-50 px-6 py-10 text-center">
      <div className="w-full max-w-sm">
        <span
          aria-hidden="true"
          className="mx-auto mb-5 flex size-16 items-center justify-center rounded-2xl bg-ink-200 text-3xl"
        >
          📡
        </span>
        <h1 className="text-xl font-semibold text-ink-900">{t('offline.title')}</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-600">{t('offline.body')}</p>
        <p className="mt-2 text-sm leading-relaxed text-ink-500">{t('offline.hint')}</p>
        <a
          href="/calendar"
          className="mt-7 inline-flex h-11 items-center justify-center rounded-xl bg-brand-500 px-5 text-sm font-medium text-white hover:bg-brand-600"
        >
          {t('offline.retry')}
        </a>
      </div>
    </main>
  );
}
