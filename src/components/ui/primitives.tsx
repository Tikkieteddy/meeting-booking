'use client';

import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes, useId } from 'react';

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

// ------------------------------------------------------------
// ปุ่ม
// ------------------------------------------------------------
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
};

const BUTTON_VARIANTS: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-brand-500 text-white hover:bg-brand-600 active:bg-brand-700 shadow-sm',
  secondary: 'bg-white text-ink-800 border border-ink-200 hover:bg-ink-50',
  ghost: 'bg-transparent text-ink-700 hover:bg-ink-100',
  danger: 'bg-red-600 text-white hover:bg-red-700',
};

const BUTTON_SIZES: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-11 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-50',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading && <Spinner className="size-4" />}
      {children}
    </button>
  );
});

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="กำลังโหลด"
      className={cx('inline-block animate-spin rounded-full border-2 border-current border-t-transparent', className ?? 'size-5')}
    />
  );
}

// ------------------------------------------------------------
// ฟิลด์กรอกข้อมูล — error อยู่ติดฟิลด์และอ่านได้ด้วย screen reader (บรีฟข้อ 12)
// ------------------------------------------------------------
export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  error?: string | null;
  hint?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      {/*
        ข้อความใน <label> ต้องเท่ากับชื่อฟิลด์เป๊ะ ๆ ไม่มีอักขระอื่นเจือปน
        เพราะ screen reader และเครื่องมือทดสอบใช้ข้อความนี้เป็น "ชื่อ" ของ control
        (aria-hidden ซ่อนจาก accessibility tree แต่ยังอยู่ใน textContent ของ label)
        เครื่องหมาย * จึงวางไว้นอก label เป็นสัญลักษณ์ทางสายตาเท่านั้น
        ส่วนความ "จำเป็น" ประกาศผ่าน attribute required ของ control เอง
      */}
      <span className="flex items-center gap-1">
        <label htmlFor={htmlFor} className="text-sm font-medium text-ink-700">
          {label}
        </label>
        {required && (
          <span className="text-brand-600" aria-hidden="true">
            *
          </span>
        )}
      </span>
      {children}
      {hint && !error && <p className="text-xs text-ink-500">{hint}</p>}
      {error && (
        <p role="alert" className="flex items-start gap-1 text-xs font-medium text-red-700">
          <span aria-hidden="true">⚠</span>
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}

const CONTROL_BASE =
  'w-full rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm text-ink-800 ' +
  'placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 ' +
  'disabled:bg-ink-100 aria-[invalid=true]:border-red-500';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest },
  ref,
) {
  return <input ref={ref} className={cx(CONTROL_BASE, className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...rest },
  ref,
) {
  return <textarea ref={ref} className={cx(CONTROL_BASE, 'min-h-24 resize-y', className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...rest },
  ref,
) {
  return (
    <select ref={ref} className={cx(CONTROL_BASE, 'appearance-none bg-no-repeat pe-8', className)} {...rest}>
      {children}
    </select>
  );
});

export function Checkbox({
  label,
  description,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: string; description?: string }) {
  const id = useId();
  return (
    <div className="flex items-start gap-2.5">
      <input
        id={rest.id ?? id}
        type="checkbox"
        className="mt-0.5 size-5 shrink-0 rounded border-ink-300 text-brand-500 focus:ring-brand-500"
        {...rest}
      />
      <label htmlFor={rest.id ?? id} className="text-sm text-ink-700">
        <span className="font-medium">{label}</span>
        {description && <span className="block text-xs text-ink-500">{description}</span>}
      </label>
    </div>
  );
}

// ------------------------------------------------------------
// ป้ายสถานะ — ใช้สี + ข้อความ + สัญลักษณ์ ไม่สื่อด้วยสีอย่างเดียว
// ------------------------------------------------------------
const STATUS_STYLE: Record<string, { bg: string; text: string; symbol: string }> = {
  draft: { bg: 'bg-ink-100', text: 'text-ink-700', symbol: '✎' },
  pending: { bg: 'bg-purple-100', text: 'text-purple-800', symbol: '⏳' },
  confirmed: { bg: 'bg-emerald-100', text: 'text-emerald-800', symbol: '✓' },
  checked_in: { bg: 'bg-sky-100', text: 'text-sky-800', symbol: '⦿' },
  completed: { bg: 'bg-ink-100', text: 'text-ink-700', symbol: '✓✓' },
  cancelled: { bg: 'bg-ink-100', text: 'text-ink-600', symbol: '✕' },
  rejected: { bg: 'bg-red-100', text: 'text-red-800', symbol: '✕' },
  no_show: { bg: 'bg-amber-100', text: 'text-amber-900', symbol: '!' },
  maintenance: { bg: 'bg-slate-200', text: 'text-slate-800', symbol: '🛠' },
};

export function StatusBadge({ status, label }: { status: string; label: string }) {
  const style = STATUS_STYLE[status] ?? STATUS_STYLE.draft!;
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium', style.bg, style.text)}>
      <span aria-hidden="true">{style.symbol}</span>
      {label}
    </span>
  );
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'brand' | 'warn' }) {
  const tones = {
    neutral: 'bg-ink-100 text-ink-700',
    brand: 'bg-brand-50 text-brand-700',
    warn: 'bg-amber-100 text-amber-900',
  };
  return <span className={cx('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', tones[tone])}>{children}</span>;
}

// ------------------------------------------------------------
// สถานะว่าง / โหลด / ผิดพลาด
// ------------------------------------------------------------
export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-ink-200 bg-white/60 px-6 py-12 text-center">
      <span aria-hidden="true" className="text-3xl">
        📅
      </span>
      <p className="text-base font-medium text-ink-700">{title}</p>
      {description && <p className="max-w-md text-sm text-ink-500">{description}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-6 py-10 text-center">
      <span aria-hidden="true" className="text-2xl">
        ⚠️
      </span>
      <p className="text-sm font-medium text-red-800">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          ลองอีกครั้ง
        </Button>
      )}
    </div>
  );
}

export function SkeletonBlock({ className }: { className?: string }) {
  return <div className={cx('skeleton rounded-xl', className)} aria-hidden="true" />;
}
