'use client';

import { useState } from 'react';
import { Button, Input } from '@/components/ui/primitives';
import { ConfirmDialog } from '@/components/ui/overlay';
import { useToast } from '@/components/ui/toast';
import { ApiClientError, apiFetch } from '@/lib/client/api';
import { t } from '@/lib/i18n';
import { formatThaiDateShort, toDateISO, toTimeHHmm } from '@/lib/util/time';

export type FeedStatus = { active: boolean; createdAt: string | null; lastAccessedAt: string | null };

function when(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  return `${formatThaiDateShort(toDateISO(d))} ${toTimeHHmm(d)} น.`;
}

/**
 * ลิงก์ปฏิทินส่วนตัวสำหรับ Outlook / Teams (ADR-020 — ผู้ใช้เลือก "ระดับ 1" 14 ต.ค. 2569)
 * ลิงก์แสดงครั้งเดียวตอนสร้าง (ระบบเก็บแค่ค่า hash) ถ้าหายให้สร้างใหม่ ลิงก์เดิมจะใช้ไม่ได้ทันที
 */
export function CalendarFeedCard({ initial }: { initial: FeedStatus }) {
  const toast = useToast();
  const [status, setStatus] = useState<FeedStatus>(initial);
  const [link, setLink] = useState<{ url: string; webcalUrl: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState<'rotate' | 'revoke' | null>(null);

  const call = async (method: 'POST' | 'DELETE') => {
    setBusy(true);
    try {
      if (method === 'POST') {
        const res = await apiFetch<{ url: string; webcalUrl: string; feed: FeedStatus }>('/api/profile/calendar-feed', {
          method: 'POST',
        });
        setLink({ url: res.url, webcalUrl: res.webcalUrl });
        setStatus(res.feed);
        setCopied(false);
        toast.show(t('feed.created'), 'success');
      } else {
        const res = await apiFetch<{ feed: FeedStatus }>('/api/profile/calendar-feed', { method: 'DELETE' });
        setLink(null);
        setStatus(res.feed);
        toast.show(t('feed.revoked'), 'success');
      }
    } catch (error) {
      toast.show(error instanceof ApiClientError ? error.message : t('common.unknownError'), 'error');
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      toast.show(t('feed.copyFailed'), 'error');
    }
  };

  return (
    <section aria-labelledby="feed-title" className="rounded-xl border border-ink-200 p-4">
      <h3 id="feed-title" className="text-sm font-semibold text-ink-800">
        {t('feed.title')}
      </h3>
      <p className="mt-1 text-xs text-ink-600">{t('feed.desc')}</p>

      {link ? (
        <div className="mt-3 flex flex-col gap-2 rounded-lg bg-brand-50 p-3">
          <Input readOnly value={link.url} aria-label={t('feed.linkLabel')} onFocus={(e) => e.currentTarget.select()} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void copy(link.url)}>
              {copied ? t('notify.copied') : t('feed.copy')}
            </Button>
            <a
              href={link.webcalUrl}
              className="inline-flex h-9 items-center rounded-xl border border-ink-200 bg-white px-3 text-sm font-medium text-ink-700 hover:bg-ink-50"
            >
              {t('feed.openDesktop')}
            </a>
            <span role="status" className="sr-only">
              {copied ? t('notify.copied') : ''}
            </span>
          </div>
          <p className="text-xs font-medium text-amber-900">{t('feed.secretNote')}</p>
          <ol className="list-decimal ps-5 text-xs text-ink-700">
            <li>{t('feed.step1')}</li>
            <li>{t('feed.step2')}</li>
            <li>{t('feed.step3')}</li>
            <li>{t('feed.step4')}</li>
          </ol>
        </div>
      ) : status.active ? (
        <p className="mt-3 text-xs text-emerald-800">
          {t('feed.activeSince', { created: when(status.createdAt), accessed: when(status.lastAccessedAt) })}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={status.active ? 'secondary' : 'primary'}
          loading={busy}
          onClick={() => (status.active ? setConfirm('rotate') : void call('POST'))}
        >
          {status.active ? t('feed.rotate') : t('feed.create')}
        </Button>
        {status.active && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirm('revoke')}>
            {t('feed.revoke')}
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={confirm !== null}
        title={confirm === 'revoke' ? t('feed.revokeConfirm') : t('feed.rotateConfirm')}
        body={t('feed.oldLinkStops')}
        confirmLabel={t('common.confirm')}
        destructive={confirm === 'revoke'}
        onConfirm={() => void call(confirm === 'revoke' ? 'DELETE' : 'POST')}
        onClose={() => setConfirm(null)}
      />
    </section>
  );
}
