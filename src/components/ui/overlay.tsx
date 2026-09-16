'use client';

import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { cx } from './primitives';

/**
 * Modal / Drawer ที่เข้าถึงได้ (บรีฟข้อ 12)
 *  - focus trap, ปิดด้วย Esc, คืน focus ให้ตัวที่เปิด
 *  - บนมือถือแสดงเป็น Bottom sheet ตามบรีฟข้อ 2
 */
/**
 * จำ element ที่มี focus "นอก dialog" ล่าสุด
 *
 * ทำไมต้องมีตัวนี้: React ใส่ focus ให้ element ที่มี autoFocus ตอน commit
 * ซึ่งเกิด "ก่อน" useEffect ทำงาน ถ้า Overlay อ่าน document.activeElement ใน effect
 * จะได้ฟิลด์ที่อยู่ข้างใน dialog เอง ไม่ใช่ปุ่มที่กดเปิด ทำให้คืน focus ผิดที่
 * ตัวติดตามนี้จึงบันทึกเฉพาะ focus ที่เกิดนอก dialog ไว้ล่วงหน้า
 */
let lastFocusedOutsideDialog: HTMLElement | null = null;
let focusTrackerInstalled = false;

function installFocusTracker() {
  if (focusTrackerInstalled || typeof document === 'undefined') return;
  focusTrackerInstalled = true;
  document.addEventListener(
    'focusin',
    (event) => {
      const target = event.target as HTMLElement | null;
      if (target && typeof target.closest === 'function' && !target.closest('[role="dialog"]')) {
        lastFocusedOutsideDialog = target;
      }
    },
    true,
  );
}

export function Overlay({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  const focusables = useCallback(() => {
    if (!panelRef.current) return [] as HTMLElement[];
    return [
      ...panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
      ),
    ].filter((el) => el.offsetParent !== null);
  }, []);

  useEffect(() => {
    installFocusTracker();
  }, []);

  useEffect(() => {
    if (!open) return;
    // ตัวที่ควรได้ focus คืนเมื่อปิด คือ element ที่มี focus นอก dialog ล่าสุด
    const active = document.activeElement as HTMLElement | null;
    const activeIsOutside = active && active !== document.body && !active.closest('[role="dialog"]');
    previouslyFocused.current = activeIsOutside ? active : lastFocusedOutsideDialog;
    const timer = window.setTimeout(() => focusables()[0]?.focus(), 30);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = prevOverflow;

      // คืน focus ให้ตัวที่เปิด dialog หลัง DOM อัปเดตเสร็จ
      // (ถ้าเรียกทันทีในจังหวะ cleanup เบราว์เซอร์อาจย้าย focus ไป body ทับอีกครั้ง)
      const target = previouslyFocused.current;
      if (target) {
        window.requestAnimationFrame(() => {
          if (target.isConnected) target.focus();
        });
      }
    };
  }, [open, onClose, focusables]);

  if (!open) return null;

  const width = { sm: 'sm:max-w-md', md: 'sm:max-w-2xl', lg: 'sm:max-w-4xl' }[size];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-ink-900/40 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        aria-describedby={description ? 'overlay-desc' : undefined}
        className={cx(
          'relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl',
          'sm:rounded-2xl',
          width,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-ink-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-ink-900">{title}</h2>
            {description && (
              <p id="overlay-desc" className="mt-0.5 text-sm text-ink-500">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดหน้าต่าง"
            className="rounded-full p-2 text-ink-500 hover:bg-ink-100"
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="border-t border-ink-100 bg-ink-50 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

/** ยืนยันการทำรายการที่ย้อนกลับไม่ได้ (เช่น ยกเลิกการจอง) */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel = 'ยกเลิก',
  destructive,
  onConfirm,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  body?: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  children?: ReactNode;
}) {
  return (
    <Overlay
      open={open}
      onClose={onClose}
      title={title}
      description={body}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-11 rounded-xl border border-ink-200 bg-white px-4 text-sm font-medium">
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={cx(
              'h-11 rounded-xl px-4 text-sm font-medium text-white',
              destructive ? 'bg-red-600 hover:bg-red-700' : 'bg-brand-500 hover:bg-brand-600',
            )}
          >
            {confirmLabel}
          </button>
        </div>
      }
    >
      {children}
    </Overlay>
  );
}
