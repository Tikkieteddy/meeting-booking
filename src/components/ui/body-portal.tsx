'use client';

import { useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const noopSubscribe = () => () => {};

/**
 * วางเนื้อหาไว้ใต้ <body> ตรง ๆ แทนที่จะอยู่ในกรอบของหน้า
 *
 * ใช้กับหน้าต่างลอย (dialog, บทแนะนำ) ทุกตัว เพราะแผงเนื้อหา (#main) เป็นกลุ่มชั้นของตัวเอง
 * (isolation + ความเบลอ) — ถ้าหน้าต่างอยู่ข้างใน z-index ของมันจะถูกขังไว้ใต้แถบหัวและแถบเมนูล่างมือถือ
 * และ backdrop-filter ยังทำให้ position: fixed ยึดกรอบแผงแทนจอด้วย
 *
 * ฝั่ง server ไม่มี document — คืนค่าว่างจนกว่าจะอยู่บนเบราว์เซอร์ (ไม่ทำให้ hydration ไม่ตรงกัน)
 */
export function BodyPortal({ children }: { children: ReactNode }) {
  const isClient = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  return isClient ? createPortal(children, document.body) : null;
}
