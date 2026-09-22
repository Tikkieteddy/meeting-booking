import { t } from '@/lib/i18n';
import { cx } from './primitives';

/**
 * ปุ่ม "เปิดแผนที่" — ใช้ทุกจุดที่แสดงห้องหรืออาคาร
 * ไม่มีลิงก์ = ไม่แสดงอะไรเลย (จุดนั้นยังไม่ได้ตั้งตำแหน่ง)
 * เปิดแท็บใหม่และตัดความสัมพันธ์กับหน้าเรา (noopener) เพราะเป็นเว็บภายนอก
 */
export function MapLink({ href, className, compact }: { href: string | null | undefined; className?: string; compact?: boolean }) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cx(
        'inline-flex items-center gap-1 rounded-full border border-ink-200 bg-white text-brand-700 hover:bg-brand-50',
        compact ? 'px-2 py-0.5 text-[11px] font-medium' : 'px-2.5 py-1 text-xs font-medium',
        className,
      )}
    >
      <span aria-hidden="true">📍</span>
      {t('map.open')}
    </a>
  );
}
