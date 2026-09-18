'use client';

import type { CalendarBooking } from '@/lib/domain/calendar-shared';
import { cx } from '@/components/ui/primitives';
import { toTimeHHmm } from '@/lib/util/time';
import { t } from '@/lib/i18n';
import { bookingTone, TZ } from './shared';

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

  return (
    <button
      type="button"
      onClick={() => onOpen(booking)}
      style={style}
      className={cx(
        'group absolute z-10 flex w-full flex-col overflow-hidden rounded-lg border px-2 py-1 text-start',
        'transition-shadow hover:shadow-soft focus-visible:z-20',
        bookingTone(booking.status, booking.isMine),
        compact && 'py-0.5',
      )}
    >
      <span className="flex items-center gap-1 text-[11px] font-semibold leading-tight">
        <span aria-hidden="true">{symbol}</span>
        <span className="tabular-nums">{timeRange}</span>
        {booking.isMine && <span className="rounded bg-brand-500/15 px-1 text-[10px]">ของฉัน</span>}
      </span>
      <span className="truncate text-xs font-medium leading-snug">{booking.title}</span>
      {showBooker && <span className="truncate text-[11px] leading-tight opacity-80">{bookerLine}</span>}
      {showRoomLine && <span className="truncate text-[11px] leading-tight opacity-70">{roomName}</span>}
      {!booking.canSeeDetails && <span className="text-[11px] opacity-70">{t('booking.privateHidden')}</span>}
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
