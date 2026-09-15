import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/current-user';
import { listMyBookings } from '@/lib/domain/search';
import { BookingList } from '@/components/booking/booking-list';
import { t } from '@/lib/i18n';

export const metadata = { title: t('nav.myBookings') };
export const dynamic = 'force-dynamic';

export default async function MyBookingsPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const ctx = { userId: user.id, role: 'authenticated' as const };

  const [upcoming, all] = await Promise.all([
    listMyBookings(ctx, user.id, { upcomingOnly: true }),
    listMyBookings(ctx, user.id, { upcomingOnly: false, limit: 100 }),
  ]);
  const upcomingIds = new Set(upcoming.map((b) => b.id));
  const past = all.filter((b) => !upcomingIds.has(b.id));

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 overflow-y-auto p-4 sm:p-6">
      <section>
        <h1 className="mb-3 text-lg font-semibold text-ink-900">{t('booking.upcoming')}</h1>
        <BookingList bookings={upcoming} emptyTitle={t('booking.noBookings')} />
      </section>
      <section>
        <h2 className="mb-3 text-lg font-semibold text-ink-900">{t('booking.history')}</h2>
        <BookingList bookings={past} emptyTitle="ยังไม่มีประวัติการจอง" />
      </section>
    </div>
  );
}
