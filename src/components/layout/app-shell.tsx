'use client';

import { SmartLink as Link } from '@/components/ui/smart-link';
import { BrandMark } from '@/components/ui/brand-mark';
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
  { href: '/admin/roles', labelKey: 'nav.roles', icon: '🛡', permission: 'role:manage' },
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
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only-focusable focus:not-sr-only focus:absolute focus:start-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-brand-500 focus:px-3 focus:py-2 focus:text-white">
        {t('nav.skipToContent')}
      </a>

      <OfflineBanner />

      <header className="sticky top-0 z-30 border-b border-ink-200 bg-white/95 backdrop-blur">
        <div className="flex h-16 items-center gap-3 px-3 sm:px-5">
          {/*
            aria-label ต้องครอบคลุมข้อความที่ตาเห็น (กฎ WCAG 2.5.3 Label in Name)
            ข้อความที่เห็นคือ "TNN Meeting" ซึ่งซ่อนบนจอเล็ก จึงใช้ชื่อย่อเป็น
            aria-label และใช้โลโก้แบบ SVG เพื่อไม่ให้ตัวอักษร T กลายเป็นข้อความ
            ที่ตาเห็นแต่ไม่อยู่ในชื่อ
          */}
          <Link href="/calendar" className="flex shrink-0 items-center gap-2" aria-label={t('app.shortName')}>
            <BrandMark className="size-9 shrink-0 text-brand-500" />
            <span className="hidden text-sm font-semibold text-ink-900 sm:block">{t('app.shortName')}</span>
          </Link>

          <nav aria-label="เมนูหลัก" className="hidden items-center gap-1 md:flex">
            {PRIMARY_NAV.filter((item) => allowed(user, item)).map((item) => (
              <Link
                key={item.href}
                href={item.href}
                data-tour={item.href === '/bookings' ? 'mybookings' : undefined}
                aria-current={pathname.startsWith(item.href) ? 'page' : undefined}
                className={cx(
                  'flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-medium transition-colors',
                  pathname.startsWith(item.href) ? 'bg-brand-50 text-brand-700' : 'text-ink-600 hover:bg-ink-100',
                )}
              >
                <span aria-hidden="true">{item.icon}</span>
                {t(item.labelKey)}
              </Link>
            ))}
          </nav>

          <div className="ms-auto flex items-center gap-1.5">
            <Link
              href="/notifications"
              data-tour="bell"
              className="relative flex size-11 items-center justify-center rounded-xl text-ink-600 hover:bg-ink-100"
              aria-label={`${t('notify.center')}${unreadCount > 0 ? ` (${unreadCount} รายการใหม่)` : ''}`}
            >
              <span aria-hidden="true">🔔</span>
              {unreadCount > 0 && (
                <span className="absolute end-1.5 top-1.5 flex min-w-4 justify-center rounded-full bg-brand-500 px-1 text-[10px] font-bold text-white">
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
                className="flex h-11 items-center gap-2 rounded-xl px-2 hover:bg-ink-100"
              >
                <span className="flex size-8 items-center justify-center rounded-full bg-ink-200 text-xs font-semibold text-ink-700">
                  {user.fullName.trim().charAt(0) || '?'}
                </span>
                <span className="hidden text-start sm:block">
                  <span className="block text-sm font-medium leading-tight text-ink-800">{user.fullName}</span>
                  <span className="block text-xs leading-tight text-ink-500">{user.roleLabel}</span>
                </span>
                <span aria-hidden="true" className="text-xs text-ink-400">
                  ▾
                </span>
              </button>

              {menuOpen && (
                <div
                  role="menu"
                  className="absolute end-0 top-full z-40 mt-1 w-64 overflow-hidden rounded-2xl border border-ink-200 bg-white py-1 shadow-lift"
                >
                  <div className="border-b border-ink-100 px-4 py-2.5">
                    <p className="text-sm font-medium text-ink-800">{user.fullName}</p>
                    <p className="truncate text-xs text-ink-500">{user.email}</p>
                  </div>
                  <MenuLink href="/profile" icon="👤" label={t('nav.profile')} />
                  <MenuLink href="/help" icon="❓" label={t('nav.help')} />
                  {visibleAdmin.length > 0 && (
                    <>
                      <p className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
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
                    className="mt-1 flex w-full items-center gap-2 border-t border-ink-100 px-4 py-2.5 text-start text-sm text-red-700 hover:bg-red-50"
                  >
                    <span aria-hidden="true">↩</span>
                    {t('nav.logout')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        {toolbar}
      </header>

      <main id="main" className="flex flex-1 flex-col overflow-hidden">
        {children}
      </main>

      {/* แถบล่างสำหรับมือถือ — เข้าถึงงานหลักได้โดยไม่ต้องเลื่อนหน้า (บรีฟ AC09) */}
      <nav
        aria-label="เมนูหลัก (มือถือ)"
        className="sticky bottom-0 z-30 flex border-t border-ink-200 bg-white pb-[env(safe-area-inset-bottom,0px)] md:hidden"
      >
        {PRIMARY_NAV.filter((item) => allowed(user, item)).map((item) => (
          <Link
            key={item.href}
            href={item.href}
            data-tour={item.href === '/bookings' ? 'mybookings' : undefined}
            aria-current={pathname.startsWith(item.href) ? 'page' : undefined}
            className={cx(
              'flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium',
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

function MenuLink({ href, icon, label }: { href: string; icon: string; label: string }) {
  return (
    <Link role="menuitem" href={href} className="flex items-center gap-2 px-4 py-2.5 text-sm text-ink-700 hover:bg-ink-50">
      <span aria-hidden="true">{icon}</span>
      {label}
    </Link>
  );
}
