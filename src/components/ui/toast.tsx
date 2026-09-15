'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { cx } from './primitives';

type Toast = { id: number; message: string; tone: 'success' | 'error' | 'info' };

const ToastContext = createContext<{ show: (message: string, tone?: Toast['tone']) => void } | null>(null);

/** Toast ใช้แจ้งผลสั้น ๆ ส่วน error สำคัญต้องอยู่ใกล้ฟิลด์ (บรีฟข้อ 12) */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const show = useCallback((message: string, tone: Toast['tone'] = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, tone }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
  }, []);

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cx(
              'pointer-events-auto flex max-w-md items-start gap-2 rounded-xl px-4 py-3 text-sm shadow-lg',
              toast.tone === 'success' && 'bg-emerald-600 text-white',
              toast.tone === 'error' && 'bg-red-600 text-white',
              toast.tone === 'info' && 'bg-ink-800 text-white',
            )}
          >
            <span aria-hidden="true">{toast.tone === 'success' ? '✓' : toast.tone === 'error' ? '⚠' : 'ℹ'}</span>
            <span>{toast.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast ต้องอยู่ภายใต้ ToastProvider');
  return ctx;
}
