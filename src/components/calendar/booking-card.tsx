'use client';

import type { CalendarBooking } from '@/lib/domain/calendar-shared';
import { cx } from '@/components/ui/primitives';
import { toTimeHHmm } from '@/lib/util/time';
import { t } from '@/lib/i18n';
import { bookingTone, PRIORITY_PILL, TZ } from './shared';

const STATUS_SYMBOL: Record<string, string> = {
  pending: '⏳',
  confirmed: '✓',
  checked_in: '⦿',
  completed: '✓✓',
  maintenance: '🛠',
  no_show: '!',
};

/** การ์ดการจองในตารางเวลา — แสดงเวลา หัวข้อ ผู้จอง และสถานะ (บรีฟข้อ 3.1) */
export function BookingCard({
  booking,
  onOpen,
  compact,
  style,
  showRoom,
  roomName,
}: {
  booking: CalendarBooking;
  onOpen: (booking: CalendarBooking) => void;
  compact?: boolean;
  style?: React.CSSProperties;
  showRoom?: boolean;
  roomName?: string;
}) {
  const start = toTimeHHmm(new Date(booking.startsAt), TZ);
  const end = toTimeHHmm(new Date(booking.endsAt), TZ);
  const statusLabel = t(`status.${booking.status}` as 'status.confirmed');
  const symbol = STATUS_SYMBOL[booking.status] ?? '•';

  const timeRange = `${start}\u2013${end}`;
  const bookerLine = booking.bookerName
    ? `${booking.bookerName}${booking.bookerDepartment ? ` \u00b7 ${booking.bookerDepartment}` : ''}`
    : '';
  const showBooker = !compact && booking.canSeeDetails && Boolean(booking.bookerName);
  const showRoomLine = !compact && Boolean(showRoom) && Boolean(roomName);
  // ป้ายความสำคัญ (ด่วน/VIP/ภายใน) แบบในแบบจาก Stitch — "ปกติ" ไม่แสดงป้าย
  const priorityPill =
    booking.priority && booking.priority !== 'normal' ? (
      <span className={cx('shrink-0 rounded px-1 text-[0.625rem] font-bold', PRIORITY_PILL[booking.priority])}>
        {t(`booking.priority.${booking.priority}` as 'booking.priority.urgent')}
      </span>
    ) : null;

  return (
    <button
      type="button"
      onClick={() => onOpen(booking)}
      style={style}
      className={cx(
        // แบบจาก Stitch: พื้นสีอ่อน ขอบบาง แถบสีทึบด้านซ้าย มุมโค้ง เงานุ่ม
        'group absolute z-10 flex w-full flex-col gap-0.5 overflow-hidden rounded-lg border border-s-4 px-2 py-1.5 text-start shadow-[0_2px_6px_-1px_rgb(31_26_23/0.06)]',
        'transition-shadow hover:shadow-soft focus-visible:z-20',
        bookingTone(booking.status, booking.isMine),
        compact && 'justify-center py-0.5',
      )}
    >
      {compact ? (
        /*
         * การจองสั้น (เช่น 30 นาที) การ์ดเตี้ยจนวางได้บรรทัดเดียว — เดิมเห็นแค่เวลา
         * ผู้ใช้ขอให้เห็นชื่องานและผู้จองด้วย จึงเรียง เวลา · ชื่องาน · ผู้จอง ในบรรทัดเดียว ตัดท้ายด้วย …
         */
        <span className="flex min-w-0 items-center gap-1.5 whitespace-nowrap text-[0.6875rem] leading-tight">
          <span className="shrink-0 font-semibold tabular-nums">
            <span aria-hidden="true">{symbol} </span>
            {timeRange}
          </span>
          {priorityPill}
          {booking.canSeeDetails ? (
            <span className="min-w-0 truncate">
              <span className="font-bold">{booking.title}</span>
              {booking.bookerName && <span className="opacity-90"> · {booking.bookerName}</span>}
            </span>
          ) : (
            <span className="min-w-0 truncate opacity-90">{t('booking.privateHidden')}</span>
          )}
        </span>
      ) : (
        <>
          <span className="flex items-center gap-1 text-[0.6875rem] font-semibold leading-tight">
            <span aria-hidden="true">{symbol}</span>
            <span className="tabular-nums">{timeRange}</span>
            {priorityPill}
            {booking.status === 'pending' && (
              <span className="ms-auto shrink-0 rounded-full bg-amber-200 px-1.5 text-[0.625rem] font-bold text-amber-950">
                {statusLabel}
              </span>
            )}
            {booking.isMine && booking.status !== 'pending' && (
              <span className="ms-auto shrink-0 rounded-full bg-brand-100 px-1.5 text-[0.625rem] font-bold text-brand-900">ของฉัน</span>
            )}
          </span>
          <span className="truncate text-xs font-bold leading-snug">{booking.title}</span>
          {booking.category && booking.canSeeDetails && (
            <span className="w-fit max-w-full truncate rounded bg-white/70 px-1 text-[0.625rem] font-semibold">
              {booking.category}
            </span>
          )}
          {showBooker && (
            <span className="truncate text-[0.6875rem] leading-tight opacity-90">
              <span aria-hidden="true">👤 </span>
              {bookerLine}
            </span>
          )}
          {showRoomLine && <span className="truncate text-[0.6875rem] leading-tight opacity-90">{roomName}</span>}
          {!booking.canSeeDetails && <span className="text-[0.6875rem] opacity-90">{t('booking.privateHidden')}</span>}
        </>
      )}
      {/*
        ไม่ใช้ aria-label ที่นี่โดยเจตนา
        กฎ WCAG 2.5.3 (Label in Name) กำหนดว่าชื่อที่ screen reader อ่าน
        ต้องครอบคลุมข้อความที่ตาเห็นทั้งหมด เพราะคนที่สั่งงานด้วยเสียงจะพูด
        ตามที่เห็นบนจอ ถ้าเขียน aria-label แยกเอง มันจะหลุดจากเนื้อหาที่แสดงผล
        ทุกครั้งที่มีคนแก้การ์ดนี้
        วิธีนี้ให้ชื่อเกิดจากเนื้อหาจริงเสมอ แล้วเติมเฉพาะสถานะซึ่งบนจอสื่อด้วย
        สัญลักษณ์กับสี ให้เป็นข้อความที่อ่านออกเสียงได้
      */}
      <span className="sr-only">สถานะ {statusLabel}</span>
    </button>
  );
}
