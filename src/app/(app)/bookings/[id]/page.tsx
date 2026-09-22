import { notFound, redirect } from 'next/navigation';
import { MapLink } from '@/components/ui/map-link';
import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/current-user';
import { getBookingDetail } from '@/lib/domain/booking-service';
import { StatusBadge } from '@/components/ui/primitives';
import { BookingActions } from '@/components/booking/booking-actions';
import { t } from '@/lib/i18n';
import { formatThaiDate, formatTimeRange } from '@/lib/util/time';
import { isWithinCheckInWindow } from '@/lib/domain/booking-rules';

export const dynamic = 'force-dynamic';

/** หน้ารายละเอียดการจองแบบลิงก์ตรง — ใช้จากอีเมลและ LINE */
export default async function BookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const { id } = await params;
  const detail = await getBookingDetail({ userId: user.id, role: 'authenticated' }, id);
  if (!detail) notFound();

  const isOwner = detail.bookerProfileId === user.id;
  const isManager = user.permissions.includes('booking:manage_all');
  const editable = !['cancelled', 'rejected', 'completed'].includes(detail.status);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 overflow-y-auto p-4 sm:p-6">
      <Link href="/calendar" className="text-sm text-brand-700 underline-offset-2 hover:underline">
        ← กลับไปหน้าปฏิทิน
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900">{detail.canSeeDetails ? detail.title : t('booking.busySlot')}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-600">
            <span>
              {detail.roomName} ({detail.roomCode}) · {formatThaiDate(detail.startsAt.toISOString().slice(0, 10))}{' '}
              {formatTimeRange(detail.startsAt, detail.endsAt)}
            </span>
            <MapLink href={detail.roomMapLink} compact />
          </p>
        </div>
        <StatusBadge status={detail.status} label={t(`status.${detail.status}` as 'status.confirmed')} />
      </header>

      <dl className="grid gap-4 rounded-2xl border border-ink-200 bg-white p-4 sm:grid-cols-2">
        <Item label={t('booking.bookedBy')} value={detail.bookerName} />
        <Item label={t('auth.department')} value={detail.bookerDepartment ?? '-'} />
        <Item label={t('booking.attendeeCount')} value={`${detail.attendeeCount} ${t('common.people')}`} />
        <Item label={t('booking.privacy')} value={t(`booking.privacy.${detail.privacy}` as 'booking.privacy.public')} />
        {detail.purpose && <Item label={t('booking.purpose')} value={detail.purpose} />}
        {detail.notes && <Item label={t('booking.notes')} value={detail.notes} />}
      </dl>

      {detail.attendees.length > 0 && (
        <section className="rounded-2xl border border-ink-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-ink-800">{t('booking.attendees')}</h2>
          <ul className="flex flex-col gap-1 text-sm text-ink-700">
            {detail.attendees.map((a) => (
              <li key={a.email}>
                {a.displayName ? `${a.displayName} · ` : ''}
                {a.email}
              </li>
            ))}
          </ul>
        </section>
      )}

      <BookingActions
        bookingId={detail.id}
        seriesId={detail.seriesId}
        canCancel={editable && (isOwner || isManager)}
        canCheckIn={
          detail.status === 'confirmed' &&
          (isOwner || user.permissions.includes('booking:check_in_any')) &&
          isWithinCheckInWindow(detail.policy, detail.startsAt)
        }
      />
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-ink-500">{label}</dt>
      <dd className="whitespace-pre-wrap text-sm font-medium text-ink-800">{value}</dd>
    </div>
  );
}
