'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, EmptyState, Field, Textarea } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { ApiClientError, apiFetch } from '@/lib/client/api';
import { t } from '@/lib/i18n';
import { formatThaiDate, toTimeHHmm } from '@/lib/util/time';

export type PendingItem = {
  id: string;
  roomName: string;
  title: string;
  startsAt: string;
  endsAt: string;
  bookerName: string | null;
  bookerDepartment: string | null;
  attendeeCount: number;
  purpose: string | null;
};

/** คิวรออนุมัติ — อนุมัติ ปฏิเสธ (ต้องมีเหตุผล) หรือขอข้อมูลเพิ่ม (บรีฟข้อ 8) */
export function ApprovalQueue({ items }: { items: PendingItem[] }) {
  const router = useRouter();
  const toast = useToast();
  const [comments, setComments] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const decide = async (id: string, decision: 'approved' | 'rejected' | 'info_requested') => {
    setBusyId(id);
    try {
      await apiFetch(`/api/approvals/${id}`, {
        method: 'POST',
        body: JSON.stringify({ decision, comment: comments[id] ?? null }),
      });
      toast.show(decision === 'approved' ? t('approval.approved') : decision === 'rejected' ? t('approval.rejected') : 'ส่งคำขอข้อมูลเพิ่มแล้ว', 'success');
      router.refresh();
    } catch (error) {
      toast.show(error instanceof ApiClientError ? error.message : t('common.unknownError'), 'error');
    } finally {
      setBusyId(null);
    }
  };

  if (items.length === 0) return <EmptyState title={t('approval.empty')} description="เมื่อมีคำขอจองห้องที่ต้องอนุมัติ รายการจะแสดงที่นี่" />;

  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => (
        <li key={item.id} className="rounded-2xl border border-ink-200 bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink-900">{item.title}</p>
              <p className="text-xs text-ink-500">
                {item.roomName} · {formatThaiDate(item.startsAt.slice(0, 10))} {toTimeHHmm(new Date(item.startsAt))}–
                {toTimeHHmm(new Date(item.endsAt))} น. · {item.attendeeCount} {t('common.people')}
              </p>
              <p className="mt-1 text-xs text-ink-600">
                {t('booking.bookedBy')}: {item.bookerName ?? '-'}
                {item.bookerDepartment ? ` · ${item.bookerDepartment}` : ''}
              </p>
              {item.purpose && <p className="mt-1 text-xs text-ink-600">{t('booking.purpose')}: {item.purpose}</p>}
            </div>
          </div>

          <div className="mt-3">
            <Field label={t('approval.comment')} htmlFor={`comment-${item.id}`} hint="จำเป็นเมื่อกดปฏิเสธ">
              <Textarea
                id={`comment-${item.id}`}
                value={comments[item.id] ?? ''}
                onChange={(event) => setComments((prev) => ({ ...prev, [item.id]: event.target.value }))}
                className="min-h-16"
                maxLength={500}
              />
            </Field>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" loading={busyId === item.id} onClick={() => decide(item.id, 'approved')}>
              {t('approval.approve')}
            </Button>
            <Button size="sm" variant="danger" disabled={busyId === item.id} onClick={() => decide(item.id, 'rejected')}>
              {t('approval.reject')}
            </Button>
            <Button size="sm" variant="secondary" disabled={busyId === item.id} onClick={() => decide(item.id, 'info_requested')}>
              {t('approval.requestInfo')}
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
