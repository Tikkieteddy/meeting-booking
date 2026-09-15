'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, EmptyState, cx } from '@/components/ui/primitives';
import { apiFetch } from '@/lib/client/api';
import { t } from '@/lib/i18n';
import { formatThaiDateShort, toTimeHHmm } from '@/lib/util/time';

export type InAppNotification = {
  id: string;
  eventType: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

/** ศูนย์การแจ้งเตือนในระบบ พร้อมสถานะอ่านแล้วและลิงก์ไปการจอง (บรีฟข้อ 10) */
export function NotificationCenter({ initial }: { initial: InAppNotification[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState(false);
  const unread = items.filter((i) => i.readAt === null).length;

  const markAll = async () => {
    setBusy(true);
    try {
      await apiFetch('/api/notifications/read-all', { method: 'POST', body: JSON.stringify({}) });
      const now = new Date().toISOString();
      setItems((prev) => prev.map((i) => (i.readAt ? i : { ...i, readAt: now })));
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const markOne = async (id: string) => {
    await apiFetch('/api/notifications/read-all', { method: 'POST', body: JSON.stringify({ id }) });
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, readAt: new Date().toISOString() } : i)));
    router.refresh();
  };

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-ink-900">
          {t('notify.center')}
          {unread > 0 && <span className="ms-2 rounded-full bg-brand-500 px-2 py-0.5 text-xs text-white">{unread}</span>}
        </h1>
        {unread > 0 && (
          <Button variant="secondary" size="sm" onClick={markAll} loading={busy}>
            {t('notify.markAllRead')}
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <EmptyState title={t('notify.empty')} description="ระบบจะแจ้งเตือนเมื่อมีการจอง อนุมัติ หรือเตือนก่อนประชุม" />
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li
              key={item.id}
              className={cx(
                'rounded-xl border p-3',
                item.readAt ? 'border-ink-200 bg-white' : 'border-brand-200 bg-brand-50/50',
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink-900">
                    {!item.readAt && (
                      <span aria-hidden="true" className="me-1.5 inline-block size-2 rounded-full bg-brand-500" />
                    )}
                    {item.title}
                  </p>
                  {item.body && <p className="mt-0.5 whitespace-pre-line text-xs text-ink-600">{item.body}</p>}
                  <p className="mt-1 text-[11px] text-ink-400">
                    {formatThaiDateShort(item.createdAt.slice(0, 10))} {toTimeHHmm(new Date(item.createdAt))}
                    {!item.readAt && <span className="ms-2 text-brand-600">ยังไม่อ่าน</span>}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  {item.link && (
                    <Link
                      href={item.link}
                      onClick={() => void markOne(item.id)}
                      className="text-xs font-medium text-brand-700 underline-offset-2 hover:underline"
                    >
                      เปิดดู
                    </Link>
                  )}
                  {!item.readAt && (
                    <button type="button" onClick={() => void markOne(item.id)} className="text-xs text-ink-500 hover:text-ink-700">
                      อ่านแล้ว
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
