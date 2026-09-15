import { getBookingReport, toCsv } from '@/lib/domain/reports';
import { currentActor } from '@/lib/api/actor';
import { requirePermission } from '@/lib/auth/current-user';
import { withApi } from '@/lib/api/respond';
import { t } from '@/lib/i18n';
import { toDateISO, toTimeHHmm } from '@/lib/util/time';

/** Export CSV ตามสิทธิ์ (บรีฟข้อ 11) — RLS จำกัดแถวที่เห็นอยู่แล้ว */
export const dynamic = 'force-dynamic';

export const GET = withApi(async (request: Request) => {
  await requirePermission('report:read');
  const { ctx } = await currentActor();
  const url = new URL(request.url);
  const fromISO = url.searchParams.get('from') ?? toDateISO(new Date());
  const toISO = url.searchParams.get('to') ?? toDateISO(new Date());
  const roomId = url.searchParams.get('roomId');

  const rows = await getBookingReport(ctx, { fromISO, toISO, roomId });
  const csv = toCsv(
    rows.map((r) => ({
      ...r,
      date: toDateISO(new Date(r.startsAt)),
      start: toTimeHHmm(new Date(r.startsAt)),
      end: toTimeHHmm(new Date(r.endsAt)),
      statusLabel: t(`status.${r.status}` as 'status.confirmed'),
      checkedInLabel: r.checkedIn ? 'เช็กอินแล้ว' : 'ไม่ได้เช็กอิน',
    })),
    [
      { key: 'date', label: 'วันที่' },
      { key: 'start', label: 'เวลาเริ่ม' },
      { key: 'end', label: 'เวลาสิ้นสุด' },
      { key: 'hours', label: 'ชั่วโมง' },
      { key: 'roomName', label: 'ห้องประชุม' },
      { key: 'title', label: 'หัวข้อ' },
      { key: 'bookerName', label: 'ผู้จอง' },
      { key: 'department', label: 'แผนก' },
      { key: 'attendeeCount', label: 'จำนวนผู้เข้าร่วม' },
      { key: 'statusLabel', label: 'สถานะ' },
      { key: 'checkedInLabel', label: 'การเช็กอิน' },
    ],
  );

  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="booking-report-${fromISO}-${toISO}.csv"`,
      'cache-control': 'no-store',
    },
  });
});
