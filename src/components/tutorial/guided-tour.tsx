'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Button } from '@/components/ui/primitives';
import { t, type MessageKey } from '@/lib/i18n';

/**
 * ขั้นตอนของคำแนะนำการใช้งาน
 *
 * target = ตัวชี้ไปยังของจริงบนหน้าจอ (attribute data-tour) ถ้าหาไม่เจอ เช่นเปิด
 * คำแนะนำจากหน้าช่วยเหลือที่ไม่มีปฏิทินอยู่ จะแสดงเป็นกล่องกลางจอตามเดิม
 * ไม่ล้มและไม่ชี้ผิดที่
 */
type Step = { title: MessageKey; body: MessageKey; icon: string; target?: string };

const STEPS: Step[] = [
  { title: 'tutorial.step1.title', body: 'tutorial.step1.body', icon: '👋' },
  { title: 'tutorial.step2.title', body: 'tutorial.step2.body', icon: '📆', target: '[data-tour="datenav"]' },
  { title: 'tutorial.step3.title', body: 'tutorial.step3.body', icon: '🚪', target: '[data-tour="roompicker"]' },
  { title: 'tutorial.step4.title', body: 'tutorial.step4.body', icon: '🗓', target: '[data-tour="views"]' },
  { title: 'tutorial.step5.title', body: 'tutorial.step5.body', icon: '⏱', target: '[data-tour="nowline"]' },
  { title: 'tutorial.step6.title', body: 'tutorial.step6.body', icon: '➕', target: '[data-tour="bookbutton"]' },
  { title: 'tutorial.step7.title', body: 'tutorial.step7.body', icon: '🔍', target: '[data-tour="search"]' },
  { title: 'tutorial.step8.title', body: 'tutorial.step8.body', icon: '📋', target: '[data-tour="mybookings"]' },
  { title: 'tutorial.step9.title', body: 'tutorial.step9.body', icon: '🔔', target: '[data-tour="bell"]' },
  { title: 'tutorial.step10.title', body: 'tutorial.step10.body', icon: '👤', target: '[data-tour="profilemenu"]' },
];

type Rect = { top: number; left: number; width: number; height: number };

/** ระยะเผื่อรอบจุดที่ชี้ / ระยะห่างของกล่องคำอธิบาย / ความกว้างกล่อง (px) */
const PAD = 8;
const GAP = 12;
const CARD_WIDTH = 360;
const EDGE = 16;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Guided tour สำหรับผู้ใช้ครั้งแรก (บรีฟข้อ 7.2)
 *
 * ชี้ไปที่ของจริงบนหน้าจอทีละจุด โดยเจาะช่องสว่างรอบจุดนั้นแล้วหรี่ที่เหลือ
 * ข้ามได้ตลอดเวลาและเปิดดูใหม่ได้จากหน้าช่วยเหลือ — ไม่ขวางการจองเร่งด่วน
 */
export function GuidedTour({ onFinish, forceOpen }: { onFinish?: () => void; forceOpen?: boolean }) {
  const [open, setOpen] = useState(Boolean(forceOpen));
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const current = STEPS[step]!;
  const isLast = step === STEPS.length - 1;

  useEffect(() => {
    if (forceOpen) {
      setOpen(true);
      setStep(0);
      return;
    }
    // หน่วงเล็กน้อยให้ปฏิทินโหลดเสร็จก่อน จะได้ชี้ไปที่ของที่วางตัวนิ่งแล้ว
    const timer = window.setTimeout(() => setOpen(true), 600);
    return () => window.clearTimeout(timer);
  }, [forceOpen]);

  /** วัดตำแหน่งของจุดที่ขั้นนี้ชี้ไป — คืน null ถ้าไม่มีหรือมองไม่เห็น */
  const measure = useCallback(() => {
    const selector = STEPS[step]?.target;
    if (!selector) {
      setRect(null);
      return;
    }
    /*
     * เมนูหลักมีสองชุด (จอใหญ่กับจอเล็ก) และเส้นเวลาปัจจุบันก็มีทั้งมุมมองรายวัน
     * และรายสัปดาห์ ชุดที่ไม่ได้ใช้จะถูกซ่อนด้วย CSS ซึ่งวัดขนาดได้ 0
     * จึงต้องเลือก "ตัวที่มองเห็นจริง" ตัวแรก ไม่ใช่ตัวแรกใน DOM
     */
    const target = [...document.querySelectorAll(selector)]
      .map((el) => el.getBoundingClientRect())
      .find((r) => r.width >= 1 && r.height >= 1);
    if (!target) {
      setRect(null);
      return;
    }
    setRect({
      top: target.top - PAD,
      left: target.left - PAD,
      width: target.width + PAD * 2,
      height: target.height + PAD * 2,
    });
  }, [step]);

  // เลื่อนจุดที่จะชี้เข้ามาในจอก่อน แล้วรอให้การเลื่อนนิ่งจึงวัดตำแหน่ง
  useEffect(() => {
    if (!open) return;
    const selector = STEPS[step]?.target;
    const el = selector
      ? [...document.querySelectorAll(selector)].find((node) => {
          const r = node.getBoundingClientRect();
          return r.width >= 1 && r.height >= 1;
        })
      : null;
    el?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
    const timer = window.setTimeout(measure, 320);
    return () => window.clearTimeout(timer);
  }, [open, step, measure]);

  // ผู้ใช้หมุนจอ ย่อหน้าต่าง หรือเลื่อนหน้า กรอบต้องตามไปด้วย
  useEffect(() => {
    if (!open) return;
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [open, measure]);

  const close = useCallback(() => {
    setOpen(false);
    onFinish?.();
  }, [onFinish]);

  // Escape = ข้าม (พฤติกรรมเดียวกับ dialog อื่นในระบบ)
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  // ย้าย focus มาที่กล่องทุกครั้งที่เปลี่ยนขั้น เพื่อให้ screen reader อ่านเนื้อหาใหม่
  useEffect(() => {
    if (open) cardRef.current?.focus();
  }, [open, step]);

  if (!open) return null;

  /*
   * วางกล่องคำอธิบายด้านล่างจุดที่ชี้ถ้าจุดนั้นอยู่ครึ่งบนของจอ ไม่อย่างนั้นวางด้านบน
   * ใช้ top หรือ bottom อย่างใดอย่างหนึ่ง จึงไม่ต้องรู้ความสูงของกล่องล่วงหน้า
   * และจำกัดความสูงไว้ไม่ให้ล้นจอบนมือถือ
   */
  let cardStyle: CSSProperties | undefined;
  if (rect && typeof window !== 'undefined') {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(CARD_WIDTH, vw - EDGE * 2);
    const left = clamp(rect.left + rect.width / 2 - width / 2, EDGE, Math.max(EDGE, vw - width - EDGE));
    const below = rect.top + rect.height / 2 < vh / 2;
    cardStyle = below
      ? { width, left, top: rect.top + rect.height + GAP, maxHeight: vh - (rect.top + rect.height + GAP) - EDGE }
      : { width, left, bottom: vh - rect.top + GAP, maxHeight: rect.top - GAP - EDGE };
  }

  return (
    <>
      {/*
        จุดที่กำลังชี้: หรี่ทุกด้านด้วยแผ่นทึบ 4 แผ่นล้อมรอบ แล้วตีกรอบสีแบรนด์รอบช่องที่เว้นไว้

        เลือกสี่แผ่นแทนการใช้ box-shadow วงนอกแผ่นเดียว (ซึ่งเขียนสั้นกว่า)
        เพราะแผ่นทึบกันคลิกทะลุไปโดนของข้างหลังระหว่างชมคำแนะนำได้ด้วย
        และแยกจาก ring ของกรอบ จึงไม่ต้องพึ่งการรวม box-shadow หลายชั้น

        วัดค่าจริงจากภาพที่เบราว์เซอร์เรนเดอร์แล้ว: พื้นที่ที่หรี่ได้ RGB (118,117,116)
        ช่องที่เจาะไว้ยังเป็นสีเดิมไม่ถูกหรี่ และกล่องคำอธิบายขาวสนิท
      */}
      {rect ? (
        <div aria-hidden="true">
          <div className="fixed inset-x-0 top-0 z-40 bg-ink-900/60" style={{ height: Math.max(0, rect.top) }} />
          <div className="fixed inset-x-0 bottom-0 z-40 bg-ink-900/60" style={{ top: rect.top + rect.height }} />
          <div
            className="fixed z-40 bg-ink-900/60"
            style={{ top: rect.top, height: rect.height, left: 0, width: Math.max(0, rect.left) }}
          />
          <div
            className="fixed z-40 bg-ink-900/60"
            style={{ top: rect.top, height: rect.height, left: rect.left + rect.width, right: 0 }}
          />
          <div
            className="pointer-events-none fixed z-40 rounded-xl ring-2 ring-brand-500 transition-all duration-200"
            style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
          />
        </div>
      ) : (
        <div aria-hidden="true" className="fixed inset-0 z-40 bg-ink-900/60" />
      )}

      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('tutorial.title')}
        tabIndex={-1}
        data-tour-card={rect ? 'anchored' : 'centered'}
        className={
          rect
            ? 'fixed z-50 overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl outline-none'
            : 'fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl outline-none'
        }
        style={cardStyle}
      >
        <p className="text-xs font-medium text-brand-700">
          {t('tutorial.title')} · {t('tutorial.of', { step: step + 1, total: STEPS.length })}
        </p>
        <div className="mt-3 flex items-start gap-3">
          <span aria-hidden="true" className="text-2xl">
            {current.icon}
          </span>
          <div>
            <h2 className="text-base font-semibold text-ink-900">{t(current.title)}</h2>
            <p className="mt-1 text-sm leading-relaxed text-ink-600">{t(current.body)}</p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
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
    </>
  );
}
