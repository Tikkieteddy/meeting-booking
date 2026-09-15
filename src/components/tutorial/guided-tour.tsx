'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/primitives';
import { t, type MessageKey } from '@/lib/i18n';

const STEPS: { title: MessageKey; body: MessageKey; icon: string }[] = [
  { title: 'tutorial.step1.title', body: 'tutorial.step1.body', icon: '🚪' },
  { title: 'tutorial.step2.title', body: 'tutorial.step2.body', icon: '🔍' },
  { title: 'tutorial.step3.title', body: 'tutorial.step3.body', icon: '🗓' },
  { title: 'tutorial.step4.title', body: 'tutorial.step4.body', icon: '⏱' },
  { title: 'tutorial.step5.title', body: 'tutorial.step5.body', icon: '🔔' },
];

/**
 * Guided tour สำหรับผู้ใช้ครั้งแรก (บรีฟข้อ 7.2)
 * ข้ามได้ตลอดเวลาและเปิดดูใหม่ได้จากหน้าช่วยเหลือ — ไม่ขวางการจองเร่งด่วน
 */
export function GuidedTour({ onFinish, forceOpen }: { onFinish?: () => void; forceOpen?: boolean }) {
  const [open, setOpen] = useState(Boolean(forceOpen));
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (forceOpen) {
      setOpen(true);
      setStep(0);
      return;
    }
    // หน่วงเล็กน้อยให้ปฏิทินโหลดเสร็จก่อน จะได้ไม่บังข้อมูลตั้งแต่วินาทีแรก
    const timer = window.setTimeout(() => setOpen(true), 600);
    return () => window.clearTimeout(timer);
  }, [forceOpen]);

  if (!open) return null;
  const current = STEPS[step]!;
  const isLast = step === STEPS.length - 1;

  const close = () => {
    setOpen(false);
    onFinish?.();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <div className="absolute inset-0 bg-ink-900/30" aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('tutorial.title')}
        className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
      >
        <p className="text-xs font-medium text-brand-600">
          {t('tutorial.title')} · {step + 1}/{STEPS.length}
        </p>
        <div className="mt-3 flex items-start gap-3">
          <span aria-hidden="true" className="text-3xl">
            {current.icon}
          </span>
          <div>
            <h2 className="text-lg font-semibold text-ink-900">{t(current.title)}</h2>
            <p className="mt-1 text-sm text-ink-600">{t(current.body)}</p>
          </div>
        </div>

        <div className="mt-5 flex items-center gap-2">
          <div className="flex gap-1" aria-hidden="true">
            {STEPS.map((_, index) => (
              <span
                key={index}
                className={index === step ? 'size-2 rounded-full bg-brand-500' : 'size-2 rounded-full bg-ink-200'}
              />
            ))}
          </div>
          <div className="ms-auto flex gap-2">
            <Button variant="ghost" size="sm" onClick={close}>
              {t('common.skip')}
            </Button>
            {step > 0 && (
              <Button variant="secondary" size="sm" onClick={() => setStep((s) => s - 1)}>
                {t('common.previous')}
              </Button>
            )}
            <Button size="sm" onClick={() => (isLast ? close() : setStep((s) => s + 1))}>
              {isLast ? t('tutorial.finish') : t('common.next')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
