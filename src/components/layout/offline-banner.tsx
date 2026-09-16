'use client';

import { useEffect, useState } from 'react';
import { t } from '@/lib/i18n';

/**
 * แถบแจ้งเตือนเมื่อขาดการเชื่อมต่อ (บรีฟข้อ 12: ต้องมี Offline state ที่ชัดเจน)
 * แสดงทับด้านบนพร้อมปุ่มลองใหม่ และหายไปเองเมื่อกลับมาออนไลน์
 */
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-wrap items-center justify-center gap-2 bg-amber-100 px-3 py-2 text-center text-xs font-medium text-amber-900"
    >
      <span aria-hidden="true">⚠</span>
      <span>{t('common.offline')}</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded-lg border border-amber-300 bg-white px-2 py-0.5 text-amber-900"
      >
        {t('common.retry')}
      </button>
    </div>
  );
}
