'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/primitives';
import { ReminderEditor } from '@/components/ui/reminder-editor';
import { useToast } from '@/components/ui/toast';
import { ApiClientError, apiFetch } from '@/lib/client/api';
import { t } from '@/lib/i18n';

/**
 * ผู้จองแก้เวลาเตือนของการจองนี้ได้ภายหลัง (แบบแก้การแจ้งเตือนของ event ใน Google Calendar)
 * บันทึกผ่าน PATCH /api/bookings/[id] ซึ่งตั้งเตือนใหม่ให้ และไม่แจ้ง "มีการแก้ไขการจอง" ไปหาผู้เข้าร่วม
 */
export function BookingReminders({
  bookingId,
  version,
  initialLeads,
}: {
  bookingId: string;
  version: number;
  initialLeads: number[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [leads, setLeads] = useState(initialLeads);
  const [busy, setBusy] = useState(false);
  const dirty = leads.join(',') !== initialLeads.join(',');

  const save = async () => {
    setBusy(true);
    try {
      await apiFetch(`/api/bookings/${bookingId}`, {
        method: 'PATCH',
        body: JSON.stringify({ expectedVersion: version, reminderLeads: leads }),
      });
      toast.show(t('reminder.saved'), 'success');
      router.refresh();
    } catch (error) {
      toast.show(error instanceof ApiClientError ? error.message : t('common.unknownError'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-ink-200 bg-white p-4">
      <ReminderEditor id="booking-reminders" legend={t('reminder.mine')} value={leads} onChange={setLeads} />
      <div>
        <Button type="button" size="sm" loading={busy} disabled={!dirty} onClick={() => void save()}>
          {t('common.save')}
        </Button>
      </div>
    </section>
  );
}
