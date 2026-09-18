import Link from 'next/link';
import { ReplayTutorialButton } from '@/components/tutorial/replay-button';
import { t } from '@/lib/i18n';

export const metadata = { title: t('nav.help') };

const FAQ = [
  { q: 'help.faq.book.q', a: 'help.faq.book.a' },
  { q: 'help.faq.edit.q', a: 'help.faq.edit.a' },
  { q: 'help.faq.approval.q', a: 'help.faq.approval.a' },
  { q: 'help.faq.line.q', a: 'help.faq.line.a' },
] as const;

export default function HelpPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 overflow-y-auto p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-ink-900">{t('nav.help')}</h1>
        <ReplayTutorialButton />
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-ink-800">{t('help.faq')}</h2>
        {FAQ.map((item) => (
          <details key={item.q} className="rounded-xl border border-ink-200 bg-white p-4">
            <summary className="cursor-pointer text-sm font-medium text-ink-800">{t(item.q)}</summary>
            <p className="mt-2 text-sm leading-relaxed text-ink-600">{t(item.a)}</p>
          </details>
        ))}
      </section>

      <section className="rounded-xl border border-ink-200 bg-white p-4">
        <h2 className="text-base font-semibold text-ink-800">ทางลัดที่ใช้บ่อย</h2>
        <ul className="mt-2 flex flex-col gap-1.5 text-sm text-brand-700">
          <li>
            <Link href="/calendar" className="underline-offset-2 hover:underline">
              เปิดปฏิทินเพื่อจองห้อง
            </Link>
          </li>
          <li>
            <Link href="/bookings" className="underline-offset-2 hover:underline">
              ดูการจองของฉัน
            </Link>
          </li>
          <li>
            <Link href="/profile" className="underline-offset-2 hover:underline">
              ตั้งค่าการแจ้งเตือนและเชื่อม LINE
            </Link>
          </li>
        </ul>
      </section>

      {/*
        วิธีติดตั้งเป็นแอฟ — เขียนเป็นขั้นตอนต่อระบบปฏิบัติการ เพราะปุ่มอยู่ไม่เหมือนกัน
        และผู้ใช้ส่วนใหญ่ไม่เคยติดตั้งเว็บเป็นแอฟมาก่อน
      */}
      <section className="rounded-xl border border-brand-200 bg-brand-50 p-4">
        <h2 className="text-base font-semibold text-ink-900">{t('install.title')}</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-700">{t('install.intro')}</p>
        <ul className="mt-3 flex flex-col gap-2 text-sm leading-relaxed text-ink-700">
          <li className="flex gap-2">
            <span aria-hidden="true">🤖</span>
            <span>{t('install.android')}</span>
          </li>
          <li className="flex gap-2">
            <span aria-hidden="true">🍎</span>
            <span>{t('install.ios')}</span>
          </li>
          <li className="flex gap-2">
            <span aria-hidden="true">💻</span>
            <span>{t('install.desktop')}</span>
          </li>
        </ul>
        <p className="mt-3 text-xs leading-relaxed text-ink-600">{t('install.note')}</p>
      </section>

      <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <h2 className="font-semibold">ติดปัญหาการใช้งาน</h2>
        <p className="mt-1 leading-relaxed">
          หากจองไม่ได้ ไม่ได้รับอีเมล หรือเข้าสู่ระบบไม่ได้ กรุณาติดต่อผู้ดูแลระบบขององค์กร พร้อมแจ้งเวลาที่เกิดปัญหา
          และหน้าจอที่กำลังใช้งาน เพื่อให้ตรวจสอบจากบันทึกระบบได้รวดเร็ว
        </p>
      </section>
    </div>
  );
}
