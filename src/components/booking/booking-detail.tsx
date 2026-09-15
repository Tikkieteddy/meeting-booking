'use client';

import { useEffect, useState } from 'react';
import { Button, Field, SkeletonBlock, StatusBadge, Textarea } from '@/components/ui/primitives';
import { ConfirmDialog, Overlay } from '@/components/ui/overlay';
import { useToast } from '@/components/ui/toast';
import { ApiClientError, apiFetch } from '@/lib/client/api';
import { t } from '@/lib/i18n';
import { formatThaiDate, formatTimeRange } from '@/lib/util/time';

type Detail = {
  id: string;
  title: string;
  roomName: string;
  roomCode: string;
  startsAt: string;
  endsAt: string;
  status: string;
  privacy: string;
  purpose: string | null;
  notes: string | null;
  bookerName: string;
  bookerEmail: string;
  bookerDepartment: string | null;
  attendeeCount: number;
  seriesId: string | null;
  canSeeDetails: boolean;
  checkedInAt: string | null;
  attendees: { email: string; displayName: string | null; kind: string; response: string }[];
  resources: { amenityCode: string; nameTh: string; quantity: number }[];
  approvals: { id: string; step: number; status: string; comment: string | null; approverName: string | null }[];
  permissions: { canEdit: boolean; canCancel: boolean; canCheckIn: boolean };
};

/** รายละเอียดการจอง + การจัดการ (ยกเลิก เช็กอิน ดาวน์โหลด ICS) */
export function BookingDetailDrawer({
  bookingId,
  open,
  onClose,
  onChanged,
}: {
  bookingId: string | null;
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelScope, setCancelScope] = useState<'this' | 'series'>('this');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !bookingId) return;
    let active = true;
    setLoading(true);
    setError(null);
    apiFetch<{ booking: Detail }>(`/api/bookings/${bookingId}`)
      .then((data) => {
        if (active) setDetail(data.booking);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : t('common.unknownError'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, bookingId]);

  const checkIn = async () => {
    if (!bookingId) return;
    setBusy(true);
    try {
      await apiFetch(`/api/bookings/${bookingId}/check-in`, { method: 'POST' });
      toast.show(t('booking.checkInSuccess'), 'success');
      onChanged();
      onClose();
    } catch (err) {
      toast.show(err instanceof ApiClientError ? err.message : t('common.unknownError'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!bookingId) return;
    setBusy(true);
    try {
      await apiFetch(`/api/bookings/${bookingId}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason: cancelReason || null, scope: cancelScope }),
      });
      toast.show(t('booking.cancelled'), 'success');
      setConfirmCancel(false);
      onChanged();
      onClose();
    } catch (err) {
      toast.show(err instanceof ApiClientError ? err.message : t('common.unknownError'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Overlay
        open={open}
        onClose={onClose}
        title={t('booking.detail')}
        footer={
          detail && (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <a
                href={`/api/bookings/${detail.id}/ics`}
                className="inline-flex h-11 items-center rounded-xl border border-ink-200 bg-white px-4 text-sm font-medium text-ink-700 hover:bg-ink-50"
                download
              >
                {t('booking.downloadIcs')}
              </a>
              {detail.permissions.canCheckIn && detail.status === 'confirmed' && (
                <Button variant="secondary" onClick={checkIn} loading={busy}>
                  {t('booking.checkIn')}
                </Button>
              )}
              {detail.permissions.canCancel && !['cancelled', 'rejected', 'completed'].includes(detail.status) && (
                <Button variant="danger" onClick={() => setConfirmCancel(true)} disabled={busy}>
                  {t('common.cancel')}การจอง
                </Button>
              )}
            </div>
          )
        }
      >
        {loading && (
          <div className="flex flex-col gap-3">
            <SkeletonBlock className="h-8" />
            <SkeletonBlock className="h-24" />
          </div>
        )}
        {error && (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">
            {error}
          </p>
        )}
        {detail && !loading && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h3 className="text-lg font-semibold text-ink-900">{detail.title}</h3>
              <StatusBadge status={detail.status} label={t(`status.${detail.status}` as 'status.confirmed')} />
            </div>

            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <Row label={t('booking.room')} value={`${detail.roomName} (${detail.roomCode})`} />
              <Row label={t('booking.date')} value={formatThaiDate(detail.startsAt.slice(0, 10))} />
              <Row label="เวลา" value={formatTimeRange(new Date(detail.startsAt), new Date(detail.endsAt))} />
              <Row label={t('booking.bookedBy')} value={`${detail.bookerName}${detail.bookerDepartment ? ` · ${detail.bookerDepartment}` : ''}`} />
              <Row label={t('booking.attendeeCount')} value={`${detail.attendeeCount} ${t('common.people')}`} />
              <Row label={t('booking.privacy')} value={t(`booking.privacy.${detail.privacy}` as 'booking.privacy.public')} />
              {detail.purpose && <Row label={t('booking.purpose')} value={detail.purpose} />}
              {detail.checkedInAt && <Row label={t('booking.checkedIn')} value={formatTimeRange(new Date(detail.checkedInAt), new Date(detail.checkedInAt))} />}
            </dl>

            {detail.resources.length > 0 && (
              <section>
                <h4 className="mb-1 text-sm font-medium text-ink-700">{t('booking.resources')}</h4>
                <ul className="flex flex-wrap gap-1.5">
                  {detail.resources.map((r) => (
                    <li key={r.amenityCode} className="rounded-full bg-ink-100 px-2.5 py-1 text-xs text-ink-700">
                      {r.nameTh} × {r.quantity}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {detail.attendees.length > 0 && (
              <section>
                <h4 className="mb-1 text-sm font-medium text-ink-700">{t('booking.attendees')}</h4>
                <ul className="flex flex-col gap-1 text-sm text-ink-700">
                  {detail.attendees.map((a) => (
                    <li key={a.email} className="flex items-center gap-2">
                      <span aria-hidden="true">{a.kind === 'external' ? '🌐' : '👤'}</span>
                      {a.displayName ? `${a.displayName} · ` : ''}
                      {a.email}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {detail.approvals.length > 0 && (
              <section>
                <h4 className="mb-1 text-sm font-medium text-ink-700">การอนุมัติ</h4>
                <ul className="flex flex-col gap-1.5 text-sm">
                  {detail.approvals.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-ink-50 px-2.5 py-1.5">
                      <span className="text-xs text-ink-500">ขั้นที่ {a.step}</span>
                      <StatusBadge status={a.status === 'approved' ? 'confirmed' : a.status === 'rejected' ? 'rejected' : 'pending'} label={t(`approval.${a.status === 'approved' ? 'approved' : a.status === 'rejected' ? 'rejected' : 'queue'}` as 'approval.queue')} />
                      {a.approverName && <span className="text-xs text-ink-600">{a.approverName}</span>}
                      {a.comment && <span className="w-full text-xs text-ink-600">“{a.comment}”</span>}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {detail.notes && (
              <section>
                <h4 className="mb-1 text-sm font-medium text-ink-700">{t('booking.notes')}</h4>
                <p className="whitespace-pre-wrap text-sm text-ink-700">{detail.notes}</p>
              </section>
            )}
          </div>
        )}
      </Overlay>

      <ConfirmDialog
        open={confirmCancel}
        title={t('booking.cancelConfirm')}
        body={t('booking.cancelConfirmBody')}
        confirmLabel={t('common.confirm')}
        destructive
        onConfirm={cancel}
        onClose={() => setConfirmCancel(false)}
      >
        <div className="flex flex-col gap-3">
          <Field label={t('booking.cancelReason')} htmlFor="cancel-reason">
            <Textarea
              id="cancel-reason"
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
              maxLength={300}
            />
          </Field>
          {detail?.seriesId && (
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium text-ink-700">{t('booking.recurrence.editScope')}</legend>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="scope" checked={cancelScope === 'this'} onChange={() => setCancelScope('this')} />
                {t('booking.recurrence.editThis')}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="scope" checked={cancelScope === 'series'} onChange={() => setCancelScope('series')} />
                {t('booking.recurrence.editAll')} (เฉพาะครั้งที่ยังไม่ถึง)
              </label>
            </fieldset>
          )}
        </div>
      </ConfirmDialog>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-ink-500">{label}</dt>
      <dd className="text-sm font-medium text-ink-800">{value}</dd>
    </div>
  );
}
