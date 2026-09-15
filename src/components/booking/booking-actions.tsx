'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, Textarea } from '@/components/ui/primitives';
import { ConfirmDialog } from '@/components/ui/overlay';
import { useToast } from '@/components/ui/toast';
import { ApiClientError, apiFetch } from '@/lib/client/api';
import { t } from '@/lib/i18n';

/** ปุ่มจัดการการจองในหน้ารายละเอียดแบบลิงก์ตรง */
export function BookingActions({
  bookingId,
  seriesId,
  canCancel,
  canCheckIn,
}: {
  bookingId: string;
  seriesId: string | null;
  canCancel: boolean;
  canCheckIn: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [scope, setScope] = useState<'this' | 'series'>('this');
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>, successMessage: string) => {
    setBusy(true);
    try {
      await fn();
      toast.show(successMessage, 'success');
      router.refresh();
    } catch (error) {
      toast.show(error instanceof ApiClientError ? error.message : t('common.unknownError'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <a
        href={`/api/bookings/${bookingId}/ics`}
        download
        className="inline-flex h-11 items-center rounded-xl border border-ink-200 bg-white px-4 text-sm font-medium text-ink-700 hover:bg-ink-50"
      >
        {t('booking.downloadIcs')}
      </a>
      {canCheckIn && (
        <Button
          variant="secondary"
          loading={busy}
          onClick={() =>
            run(async () => {
              await apiFetch(`/api/bookings/${bookingId}/check-in`, { method: 'POST' });
            }, t('booking.checkInSuccess'))
          }
        >
          {t('booking.checkIn')}
        </Button>
      )}
      {canCancel && (
        <Button variant="danger" disabled={busy} onClick={() => setConfirmOpen(true)}>
          {t('common.cancel')}การจอง
        </Button>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title={t('booking.cancelConfirm')}
        body={t('booking.cancelConfirmBody')}
        confirmLabel={t('common.confirm')}
        destructive
        onClose={() => setConfirmOpen(false)}
        onConfirm={() =>
          run(async () => {
            await apiFetch(`/api/bookings/${bookingId}/cancel`, {
              method: 'POST',
              body: JSON.stringify({ reason: reason || null, scope }),
            });
            setConfirmOpen(false);
          }, t('booking.cancelled'))
        }
      >
        <div className="flex flex-col gap-3">
          <Field label={t('booking.cancelReason')} htmlFor="reason">
            <Textarea id="reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} />
          </Field>
          {seriesId && (
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium text-ink-700">{t('booking.recurrence.editScope')}</legend>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="cancel-scope" checked={scope === 'this'} onChange={() => setScope('this')} />
                {t('booking.recurrence.editThis')}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="cancel-scope" checked={scope === 'series'} onChange={() => setScope('series')} />
                {t('booking.recurrence.editAll')}
              </label>
            </fieldset>
          )}
        </div>
      </ConfirmDialog>
    </div>
  );
}
