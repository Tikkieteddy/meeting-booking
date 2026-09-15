'use client';

import { useState } from 'react';
import type { BookingSearchResult } from '@/lib/domain/search';
import { EmptyState, StatusBadge } from '@/components/ui/primitives';
import { BookingDetailDrawer } from './booking-detail';
import { t } from '@/lib/i18n';
import { formatThaiDate, toTimeHHmm } from '@/lib/util/time';
import { useRouter } from 'next/navigation';

/** รายการการจอง พร้อมเปิดรายละเอียดเป็น Drawer */
export function BookingList({ bookings, emptyTitle }: { bookings: BookingSearchResult[]; emptyTitle: string }) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);

  if (bookings.length === 0) {
    return <EmptyState title={emptyTitle} description={t('calendar.clickToBook')} />;
  }

  return (
    <>
      <ul className="flex flex-col gap-2">
        {bookings.map((booking) => (
          <li key={booking.id}>
            <button
              type="button"
              onClick={() => setOpenId(booking.id)}
              className="flex w-full flex-wrap items-center gap-3 rounded-xl border border-ink-200 bg-white p-3 text-start hover:bg-ink-50"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink-900">{booking.title}</p>
                <p className="truncate text-xs text-ink-500">
                  {booking.roomName} · {formatThaiDate(booking.startsAt.slice(0, 10))}{' '}
                  {toTimeHHmm(new Date(booking.startsAt))}–{toTimeHHmm(new Date(booking.endsAt))} น.
                </p>
              </div>
              <StatusBadge status={booking.status} label={t(`status.${booking.status}` as 'status.confirmed')} />
            </button>
          </li>
        ))}
      </ul>
      <BookingDetailDrawer
        bookingId={openId}
        open={openId !== null}
        onClose={() => setOpenId(null)}
        onChanged={() => router.refresh()}
      />
    </>
  );
}
