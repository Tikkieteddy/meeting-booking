'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/primitives';
import { GuidedTour } from './guided-tour';
import { t } from '@/lib/i18n';

/** เปิดคำแนะนำการใช้งานซ้ำได้จากหน้าช่วยเหลือ (บรีฟข้อ 7.2 / AC08) */
export function ReplayTutorialButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        {t('tutorial.replay')}
      </Button>
      {open && <GuidedTour forceOpen onFinish={() => setOpen(false)} />}
    </>
  );
}
