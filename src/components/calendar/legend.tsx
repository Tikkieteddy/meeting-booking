import { t } from '@/lib/i18n';
import { cx } from '@/components/ui/primitives';
import { OCCUPANCY_DOT, type Occupancy } from './shared';

/** คำอธิบายสีจุดสถานะห้อง ใต้ปฏิทิน (แบบจาก Stitch) — ข้อความกำกับทุกสี ไม่ใช้สีอย่างเดียว */
export function OccupancyLegend({ className }: { className?: string }) {
  const levels: Occupancy[] = ['free', 'partial', 'almost', 'full'];
  return (
    <div
      className={cx(
        'flex shrink-0 flex-wrap items-center gap-x-5 gap-y-1 border-t border-ink-200/70 px-4 py-2.5 text-xs text-ink-700 sm:px-6',
        className,
      )}
    >
      <span className="sr-only">{t('occupancy.legend')}</span>
      {levels.map((level) => (
        <span key={level} className="flex items-center gap-1.5">
          <span aria-hidden="true" className={cx('size-2.5 rounded-full', OCCUPANCY_DOT[level])} />
          {t(`occupancy.${level}` as 'occupancy.free')}
        </span>
      ))}
    </div>
  );
}
