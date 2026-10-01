'use client';

import { SmartLink as Link } from '@/components/ui/smart-link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cx } from '@/components/ui/primitives';
import { apiFetch } from '@/lib/client/api';
import { OfflineBanner } from './offline-banner';
import { t, type MessageKey } from '@/lib/i18n';

export type ShellUser = {
  id: string;
  fullName: string;
  email: string;
  avatarUrl: string | null;
  department: string | null;
  roleLabel: string;
  permissions: string[];
};

type NavItem = { href: string; labelKey: MessageKey; icon: string; permission?: string };

const PRIMARY_NAV: NavItem[] = [
  { href: '/calendar', labelKey: 'nav.calendar', icon: '📅' },
  { href: '/bookings', labelKey: 'nav.myBookings', icon: '📋' },
  { href: '/approvals', labelKey: 'nav.approvals', icon: '✅', permission: 'booking:approve' },
];

const ADMIN_NAV: NavItem[] = [
  { href: '/admin', labelKey: 'admin.dashboard', icon: '📊', permission: 'report:read' },
  { href: '/admin/rooms', labelKey: 'nav.rooms', icon: '🚪', permission: 'room:manage' },
  { href: '/admin/users', labelKey: 'nav.users', icon: '👥', permission: 'user:manage' },
  { href: '/admin/roles', labelKey: 'nav.roles', icon: '🛡️', permission: 'role:manage' },
  { href: '/admin/reports', labelKey: 'nav.reports', icon: '📈', permission: 'report:read' },
  { href: '/admin/audit', labelKey: 'nav.auditLog', icon: '🧾', permission: 'audit:read' },
  { href: '/admin/system', labelKey: 'nav.systemHealth', icon: '🩺', permission: 'system:manage' },
];

function allowed(user: ShellUser, item: NavItem): boolean {
  return !item.permission || user.permissions.includes(item.permission);
}

export function AppShell({
  user,
  unreadCount,
  children,
  toolbar,
}: {
  user: ShellUser;
  unreadCount: number;
  children: ReactNode;
  /** แถบเครื่องมือเฉพาะหน้า (เช่น ปฏิทิน) แสดงต่อจากแถบบนหลัก */
  toolbar?: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const logout = async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  };

  const visibleAdmin = ADMIN_NAV.filter((item) => allowed(user, item));

  return (
    <div className="relative flex min-h-dvh flex-col">
      {/* ภาพห้องประชุมเป็นฉากหลัง (แบบจาก Stitch) — เป็นของตกแต่งล้วน ซ่อนจาก screen reader */}
      <div aria-hidden="true" className="app-backdrop" />

      <a href="#main" className="sr-only-focusable focus:not-sr-only focus:absolute focus:start-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-brand-500 focus:px-3 focus:py-2 focus:text-white">
        {t('nav.skipToContent')}
      </a>

      <OfflineBanner />

      {/*
        ชั้นความสูงของแถบหัว (z-40) ต้องสูงกว่าทุกอย่างในเนื้อหาหน้า (ปฏิทินใช้สูงสุด z-30)
        เพราะ backdrop-blur ทำให้ header เป็นกลุ่มชั้นของตัวเอง เมนูข้างใน (z-40) จึงสูงได้
        ไม่เกิน header — ถ้า header เท่ากับเนื้อหา เส้นเวลาปัจจุบันจะลอยทับเมนูโปรไฟล์
        (บั๊กที่ผู้ใช้เจอ 30 ก.ย. 2569) มีเทสต์ใน tests/e2e/layering.spec.ts
      */}
      {/*
        แถบหัวโปร่งสีเข้มวางบนภาพพื้นหลัง ตัวอักษรขาว — พื้นเข้ม 75% ขึ้นไปทำให้อ่านออก
        ไม่ว่าส่วนไหนของภาพจะสว่าง
      */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#1f1a17]/80 text-white backdrop-blur-md">
        <div className="flex h-16 items-center gap-3 px-3 sm:px-5">
          {/*
            ชื่อของลิงก์มาจากข้อความที่ตาเห็นเอง ไม่เขียน aria-label ทับ (กฎ WCAG 2.5.3 Label in Name)
          */}
          <Link href="/calendar" className="flex shrink-0 items-center gap-2.5">
            <BrandWordmark />
          </Link>

          <nav aria-label="เมนูหลัก" className="hidden items-center gap-1 md:flex">
            {PRIMARY_NAV.filter((item) => allowed(user, item)).map((item) => (
              <Link
                key={item.href}
                href={item.href}
                data-tour={item.href === '/bookings' ? 'mybookings' : undefined}
                aria-current={pathname.startsWith(item.href) ? 'page' : undefined}
                className={cx(
                  'flex h-10 items-center gap-1.5 whitespace-nowrap rounded-xl px-3 text-sm font-medium transition-colors',
                  pathname.startsWith(item.href) ? 'bg-white/15 text-white' : 'text-white/85 hover:bg-white/10 hover:text-white',
                )}
              >
                <span aria-hidden="true">{item.icon}</span>
                {t(item.labelKey)}
              </Link>
            ))}
          </nav>

          <p className="ms-auto hidden text-end leading-tight 2xl:block" aria-hidden="true">
            <span className="block text-sm font-semibold">{t('brand.slogan')}</span>
            <span className="block text-[0.625rem] tracking-[0.2em] text-white/75">GOOD SPACES. BRIGHTER TOMORROW.</span>
          </p>

          <div className="ms-auto flex items-center gap-1.5 2xl:ms-4">
            <Link
              href="/notifications"
              data-tour="bell"
              className="relative flex size-11 items-center justify-center rounded-xl text-white hover:bg-white/10"
              aria-label={`${t('notify.center')}${unreadCount > 0 ? ` (${unreadCount} รายการใหม่)` : ''}`}
            >
              <span aria-hidden="true">🔔</span>
              {unreadCount > 0 && (
                <span className="absolute end-1.5 top-1.5 flex min-w-4 justify-center rounded-full bg-brand-500 px-1 text-[0.625rem] font-bold text-white">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Link>

            <div ref={menuRef} className="relative">
              {/*
                บนจอเล็กปุ่มนี้แสดงเพียงอักษรย่อ จึงต้องมี aria-label กำกับ
                ไม่อย่างนั้น screen reader จะอ่านได้แค่ตัวอักษรตัวเดียว
              */}
              <button
                type="button"
                data-tour="profilemenu"
                onClick={() => setMenuOpen((v) => !v)}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                aria-label={`เมนูของ ${user.fullName} (${user.roleLabel})`}
                className="flex h-11 items-center gap-2 rounded-xl px-2 hover:bg-white/10"
              >
                <span className="flex size-8 items-center justify-center rounded-full bg-brand-500 text-xs font-semibold text-white">
                  {user.fullName.trim().charAt(0) || '?'}
                </span>
                <span className="hidden text-start lg:block">
                  <span className="block whitespace-nowrap text-sm font-medium leading-tight text-white">{user.fullName}</span>
                  <span className="block text-xs leading-tight text-white/80">{user.roleLabel}</span>
                </span>
                <span aria-hidden="true" className="text-xs text-white/80">
                  ▾
                </span>
              </button>

              {menuOpen && (
                <div
                  role="menu"
                  // สูงไม่เกินจอ (เว้นแถบหัว) ถ้ารายการเยอะให้เลื่อนในเมนู — ผู้ดูแลระบบมีเมนูมาก
                  // บนจอเตี้ยเคยล้นจนกด "ออกจากระบบ" ไม่ได้
                  className="absolute end-0 top-full z-40 mt-1 flex max-h-[calc(100dvh-5rem)] w-72 flex-col overflow-y-auto overscroll-contain rounded-2xl border border-ink-200 bg-white py-1 shadow-lift"
                >
                  <div className="border-b border-ink-100 px-4 py-2">
                    <p className="truncate text-sm font-medium leading-snug text-ink-800">{user.fullName}</p>
                    <p className="truncate text-xs leading-snug text-ink-500">{user.email}</p>
                  </div>
                  <MenuLink href="/profile" icon="👤" label={t('nav.profile')} />
                  <MenuLink href="/help" icon="❓" label={t('nav.help')} />
                  {visibleAdmin.length > 0 && (
                    <>
                      <p className="mt-1 border-t border-ink-100 px-4 pb-0.5 pt-2 text-xs font-semibold text-ink-500">
                        {t('nav.admin')}
                      </p>
                      {visibleAdmin.map((item) => (
                        <MenuLink key={item.href} href={item.href} icon={item.icon} label={t(item.labelKey)} />
                      ))}
                    </>
                  )}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={logout}
                    className="mt-1 flex w-full shrink-0 items-center gap-3 border-t border-ink-100 px-4 py-1.5 text-start text-sm leading-snug text-red-700 hover:bg-red-50"
                  >
                    <span aria-hidden="true" className="w-6 shrink-0 text-center">
                      ↩
                    </span>
                    {t('nav.logout')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        {toolbar}
      </header>

      {/*
        แผงเนื้อหาแบบกระจกฝ้าลอยบนภาพพื้นหลัง (จอ md ขึ้นไป)
        บนมือถือเป็นพื้นทึบเต็มจอ อ่านง่ายกว่าและไม่เปลืองพื้นที่
      */}
      <main
        id="main"
        className="flex flex-1 flex-col overflow-hidden bg-[#f7f5f3] md:mx-4 md:my-4 md:rounded-[1.25rem] md:border md:border-white/60 md:bg-white/[0.8] md:shadow-[0_24px_48px_-12px_rgb(0_0_0/0.35)] md:backdrop-blur-2xl lg:mx-6"
      >
        {children}
      </main>

      {/* แถบล่างสำหรับมือถือ — เข้าถึงงานหลักได้โดยไม่ต้องเลื่อนหน้า (บรีฟ AC09) */}
      <nav
        aria-label="เมนูหลัก (มือถือ)"
        className="sticky bottom-0 z-40 flex border-t border-ink-200 bg-white pb-[env(safe-area-inset-bottom,0px)] md:hidden"
      >
        {PRIMARY_NAV.filter((item) => allowed(user, item)).map((item) => (
          <Link
            key={item.href}
            href={item.href}
            data-tour={item.href === '/bookings' ? 'mybookings' : undefined}
            aria-current={pathname.startsWith(item.href) ? 'page' : undefined}
            className={cx(
              'flex flex-1 flex-col items-center gap-0.5 py-2 text-[0.6875rem] font-medium',
              // brand-600 เป็นตัวอักษรบนพื้นขาวได้ 4.36:1 ไม่ถึงเกณฑ์
              // brand-700 ที่มีอยู่ในชุดสีเดิมได้ 6.1:1 — ยังเป็นส้มโทนเดียวกัน
              pathname.startsWith(item.href) ? 'text-brand-700' : 'text-ink-500',
            )}
          >
            <span aria-hidden="true" className="text-lg">
              {item.icon}
            </span>
            {t(item.labelKey)}
          </Link>
        ))}
      </nav>
    </div>
  );
}

/** โลโก้แบบตัวอักษรตามแบบ: "TNN | MEETING ROOM / SIMPLE BOOKING. BIGGER IDEAS." */
function BrandWordmark() {
  return (
    <>
      <span className="text-2xl font-extrabold leading-none tracking-tight text-accent">TNN</span>
      <span aria-hidden="true" className="hidden h-7 w-px bg-white/30 lg:block" />
      {/* ข้อความยาวแสดงเฉพาะจอใหญ่ จอกลาง (แท็บเล็ต) ที่มีเมนูด้วยจะล้นแถบ */}
      <span className="hidden flex-col leading-none lg:flex">
        <span className="text-sm font-semibold uppercase tracking-[0.25em] text-white">Meeting Room</span>
        <span className="mt-1 text-[0.625rem] uppercase tracking-[0.15em] text-white/75">Simple booking. Bigger ideas.</span>
      </span>
    </>
  );
}

function MenuLink({ href, icon, label }: { href: string; icon: string; label: string }) {
  return (
    <Link
      role="menuitem"
      href={href}
      className="flex shrink-0 items-center gap-3 px-4 py-1.5 text-sm leading-snug text-ink-700 hover:bg-ink-50"
    >
      {/* ช่องไอคอนกว้างเท่ากันทุกแถว ข้อความจึงตรงแนวเดียวกัน */}
      <span aria-hidden="true" className="w-6 shrink-0 text-center">
        {icon}
      </span>
      <span className="min-w-0 truncate">{label}</span>
    </Link>
  );
}
