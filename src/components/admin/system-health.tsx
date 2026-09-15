'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SystemHealth } from '@/lib/domain/reports';
import { Badge, Button, cx } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { ApiClientError, apiFetch } from '@/lib/client/api';
import { t } from '@/lib/i18n';
import { formatThaiDateShort, toTimeHHmm } from '@/lib/util/time';

const STATUS_LABEL: Record<string, string> = {
  queued: 'อยู่ในคิว',
  processing: 'กำลังส่ง',
  sent: 'ส่งแล้ว',
  failed: 'ล้มเหลว (จะลองใหม่)',
  dead: 'ล้มเหลวถาวร',
  skipped: 'ข้าม',
};

/** หน้าสถานะระบบ — ดูคิวงาน งานค้าง และสั่งส่งซ้ำ (บรีฟข้อ 11 และ 22.9) */
export function SystemHealthPanel({ health, providers }: { health: SystemHealth; providers: { email: string; line: string } }) {
  const router = useRouter();
  const toast = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);

  const requeue = async (id: string) => {
    setBusyId(id);
    try {
      await apiFetch(`/api/admin/jobs/${id}/requeue`, { method: 'POST' });
      toast.show('สั่งส่งใหม่แล้ว ระบบจะส่งในรอบถัดไป', 'success');
      router.refresh();
    } catch (error) {
      toast.show(error instanceof ApiClientError ? error.message : t('common.unknownError'), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const queued = health.jobs.find((j) => j.status === 'queued')?.count ?? 0;
  const dead = health.jobs.find((j) => j.status === 'dead')?.count ?? 0;
  const laggy = (health.oldestQueuedMinutes ?? 0) > 15;

  return (
    <div className="flex flex-col gap-5">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="ผู้ให้บริการอีเมล" value={providers.email === 'log' ? 'โหมดทดสอบ (log)' : providers.email} tone={providers.email === 'log' ? 'warn' : 'ok'} />
        <Card label="ผู้ให้บริการ LINE" value={providers.line === 'log' ? 'โหมดทดสอบ (log)' : providers.line} tone={providers.line === 'log' ? 'warn' : 'ok'} />
        <Card label="งานค้างในคิว" value={String(queued)} tone={laggy ? 'error' : 'ok'} />
        <Card label={t('admin.deadLetter')} value={String(dead)} tone={dead > 0 ? 'error' : 'ok'} />
        <Card label="อีเมลที่ถูกระงับส่ง" value={String(health.emailSuppressions)} tone={health.emailSuppressions > 0 ? 'warn' : 'ok'} />
        <Card label="ผู้ใช้ที่เชื่อม LINE" value={String(health.lineLinked)} tone="ok" />
        <Card
          label="งานที่ค้างนานสุด"
          value={health.oldestQueuedMinutes === null ? 'ไม่มี' : `${health.oldestQueuedMinutes} นาที`}
          tone={laggy ? 'error' : 'ok'}
        />
      </section>

      <section className="rounded-2xl border border-ink-200 bg-white p-4">
        <h2 className="mb-3 text-base font-semibold text-ink-800">{t('admin.jobQueue')}</h2>
        <ul className="flex flex-wrap gap-2">
          {health.jobs.length === 0 && <li className="text-sm text-ink-500">ยังไม่มีงานแจ้งเตือนในระบบ</li>}
          {health.jobs.map((job) => (
            <li key={job.status}>
              <Badge tone={job.status === 'dead' ? 'warn' : 'neutral'}>
                {STATUS_LABEL[job.status] ?? job.status}: {job.count}
              </Badge>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-ink-200 bg-white p-4">
        <h2 className="mb-3 text-base font-semibold text-ink-800">ความผิดพลาดล่าสุด</h2>
        {health.recentFailures.length === 0 ? (
          <p className="text-sm text-ink-500">ไม่มีความผิดพลาดค้างอยู่</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {health.recentFailures.map((failure) => (
              <li key={failure.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-ink-200 p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink-800">
                    {failure.eventType} · {failure.channel}
                  </p>
                  <p className="truncate text-xs text-red-700">{failure.lastError ?? 'ไม่ทราบสาเหตุ'}</p>
                  <p className="text-[11px] text-ink-500">
                    ลองแล้ว {failure.attempts} ครั้ง · อัปเดต {formatThaiDateShort(failure.updatedAt.slice(0, 10))}{' '}
                    {toTimeHHmm(new Date(failure.updatedAt))}
                  </p>
                </div>
                <Button size="sm" variant="secondary" loading={busyId === failure.id} onClick={() => requeue(failure.id)}>
                  {t('admin.retryJob')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-ink-200 bg-white p-4 text-sm text-ink-600">
        <h2 className="mb-2 text-base font-semibold text-ink-800">งานตามเวลา (Cron)</h2>
        <ul className="flex flex-col gap-1">
          <li>
            <code className="rounded bg-ink-100 px-1.5 py-0.5 text-xs">/api/cron/dispatch</code> ส่งการแจ้งเตือนในคิว
            (แนะนำทุก 5 นาที)
          </li>
          <li>
            <code className="rounded bg-ink-100 px-1.5 py-0.5 text-xs">/api/cron/maintenance</code>{' '}
            ปล่อยห้องที่ไม่เช็กอิน ปิดงานที่ผ่านไปแล้ว จัดการคิวรอ และล้างข้อมูลหมดอายุ (แนะนำทุก 10 นาที)
          </li>
        </ul>
        <p className="mt-2 text-xs text-ink-500">
          ทั้งสอง endpoint ต้องแนบ header <code>authorization: Bearer &lt;CRON_SECRET&gt;</code> จึงเรียกได้
        </p>
      </section>
    </div>
  );
}

function Card({ label, value, tone }: { label: string; value: string; tone: 'ok' | 'warn' | 'error' }) {
  return (
    <div
      className={cx(
        'rounded-2xl border p-3',
        tone === 'ok' && 'border-ink-200 bg-white',
        tone === 'warn' && 'border-amber-200 bg-amber-50',
        tone === 'error' && 'border-red-200 bg-red-50',
      )}
    >
      <p className="text-xs text-ink-500">{label}</p>
      <p className="mt-0.5 text-lg font-semibold text-ink-900">{value}</p>
    </div>
  );
}
