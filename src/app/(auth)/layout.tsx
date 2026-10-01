import Link from 'next/link';
import { t } from '@/lib/i18n';

/**
 * หน้าเข้าสู่ระบบ/สมัคร/ลืมรหัสผ่าน — แบบจาก Stitch (30 ก.ย. 2569)
 * ภาพห้องประชุมเต็มจอ ซ้ายเป็นสโลแกนและจุดเด่น 3 ข้อ (จอใหญ่เท่านั้น) ขวาเป็นการ์ดฟอร์ม
 * ไม่แสดงข้อมูลใด ๆ ของระบบก่อนเข้าสู่ระบบ (เช่น ห้องที่ว่าง) เพื่อไม่ให้คนนอกเห็น
 */
const FEATURES = [
  { icon: '📅', title: 'brand.feature1', desc: 'brand.feature1Desc' },
  { icon: '🔔', title: 'brand.feature2', desc: 'brand.feature2Desc' },
  { icon: '💻', title: 'brand.feature3', desc: 'brand.feature3Desc' },
] as const;

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  /*
   * ช่องทางติดต่อ IT Helpdesk (แบบจาก Stitch) — ตั้งใน Vercel ชื่อ HELPDESK_CONTACT เช่น "โทร 1400"
   * อ่านตรงจาก process.env (ไม่ผ่าน env()) เพราะหน้ากลุ่มนี้บางหน้าประกอบล่วงหน้าตอน build
   * และ env() จะบังคับให้มี DATABASE_URL — ค่านี้ไม่ใช่ความลับ ถ้าไม่ได้ตั้งจะไม่แสดง
   */
  const helpdesk = process.env.HELPDESK_CONTACT?.trim().slice(0, 80);
  return (
    <main className="relative flex min-h-dvh flex-col px-4 py-6 sm:px-8 lg:px-12">
      <div aria-hidden="true" className="app-backdrop" />

      <header className="flex items-center gap-3 text-white">
        {/* ชื่อลิงก์มาจากข้อความที่ตาเห็นเอง (WCAG 2.5.3) */}
        <Link href="/" className="flex items-center gap-3">
          <span className="rounded-lg bg-brand-500 px-2.5 py-1 text-xl font-extrabold leading-none tracking-tight text-white shadow-md">
            TNN
          </span>
          <span aria-hidden="true" className="h-8 w-px bg-white/40" />
          <span className="flex flex-col leading-none">
            <span className="text-base font-semibold uppercase tracking-[0.25em]">Meeting Room</span>
            <span className="mt-1.5 text-[0.625rem] uppercase tracking-[0.15em] text-white/80">
              Simple booking. Bigger ideas.
            </span>
          </span>
        </Link>
      </header>

      <div className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-10 py-8 lg:grid-cols-12">
        <section className="hidden text-white lg:col-span-7 lg:block">
          <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-brand-200">
            <span aria-hidden="true" className="h-1.5 w-6 rounded-full bg-accent" />
            Good spaces. Brighter tomorrow.
          </p>
          <p className="mb-4 max-w-xl text-4xl font-bold leading-tight drop-shadow-sm">{t('brand.slogan')}</p>
          <p className="mb-8 max-w-xl text-base leading-relaxed text-white/90">{t('brand.headline')}</p>
          <ul className="flex max-w-xl flex-col gap-3">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex items-start gap-4 rounded-xl bg-white/10 p-3.5 backdrop-blur-md">
                <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-white/15 text-xl">
                  {f.icon}
                </span>
                <span className="flex flex-col">
                  <span className="text-sm font-semibold">{t(f.title)}</span>
                  <span className="mt-0.5 text-sm text-white/85">{t(f.desc)}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="flex w-full justify-center lg:col-span-5 lg:justify-end">
          <div className="w-full max-w-md">
            <p className="mb-4 text-center text-sm font-semibold text-white lg:hidden">{t('brand.slogan')}</p>
            <div className="rounded-3xl bg-white/[0.97] p-6 text-ink-800 shadow-2xl backdrop-blur-xl sm:p-8">{children}</div>
            <p className="mt-6 text-center text-xs text-white/85">{t('auth.internalSystem')}</p>
            {helpdesk && <p className="mt-2 text-center text-xs text-white/85">{t('auth.helpdesk', { contact: helpdesk })}</p>}
          </div>
        </section>
      </div>
    </main>
  );
}
