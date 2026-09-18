'use client';

import Link from 'next/link';
import type { ComponentProps } from 'react';
import { useEffect, useState } from 'react';

/**
 * ลิงก์ที่รู้จักประหยัดเน็ตของผู้ใช้
 *
 * ปัญหา: Next.js จะ "โหลดล่วงหน้า" (prefetch) หน้าถัดไปให้อัตโนมัติทันทีที่ลิงก์
 * ปรากฏบนจอ เพื่อให้กดแล้วเปลี่ยนหน้าไวขึ้น แต่เมนูของระบบนี้มีลิงก์หลายอัน
 * และอยู่ทุกหน้า บนเน็ตมือถือจึงกลายเป็นการดาวน์โหลดหน้าที่ผู้ใช้อาจไม่กดเลย
 *
 * ตัวนี้จะปิด prefetch เมื่อ:
 *   1. ผู้ใช้เปิดโหมดประหยัดเน็ตในเครื่อง (Data Saver)
 *   2. เน็ตช้ากว่า 4G
 *
 * เริ่มต้นด้วยการปิดไว้ก่อนแล้วค่อยเปิดเมื่อรู้ว่าเน็ตเร็วพอ — เอนไปทาง
 * ประหยัดเน็ตของผู้ใช้เป็นหลัก เพราะการเปลี่ยนหน้าช้าลงเสี้ยววินาทีนั้นยอมรับได้
 * แต่การกินเน็ตมือถือของคนอื่นโดยไม่จำเป็นนั้นไม่ควร
 *
 * เบราว์เซอร์ที่ไม่บอกข้อมูลเครือข่าย (Safari, Firefox) จะถือว่าเน็ตปกติ
 * และได้พฤติกรรมเดิมของ Next.js ทั้งหมด
 */

type NetworkInfo = { saveData?: boolean; effectiveType?: string; addEventListener?: unknown };

const SLOW = ['slow-2g', '2g', '3g'];

function readNetwork(): NetworkInfo | undefined {
  if (typeof navigator === 'undefined') return undefined;
  return (navigator as Navigator & { connection?: NetworkInfo }).connection;
}

function shouldPrefetch(info: NetworkInfo | undefined): boolean {
  // ไม่มีข้อมูลเครือข่าย = เบราว์เซอร์ไม่รองรับ API นี้ ให้ทำตัวเหมือนเดิม
  if (!info) return true;
  if (info.saveData) return false;
  if (info.effectiveType && SLOW.includes(info.effectiveType)) return false;
  return true;
}

export function SmartLink({ prefetch, ...props }: ComponentProps<typeof Link>) {
  const [allow, setAllow] = useState(false);

  useEffect(() => {
    const info = readNetwork();
    const sync = () => setAllow(shouldPrefetch(readNetwork()));
    sync();

    // เน็ตเปลี่ยนกลางทางได้ (เช่น เดินออกจาก Wi-Fi) จึงฟังการเปลี่ยนแปลงไว้
    const target = info as unknown as EventTarget | undefined;
    if (target && typeof target.addEventListener === 'function') {
      target.addEventListener('change', sync);
      return () => target.removeEventListener('change', sync);
    }
    return undefined;
  }, []);

  // ถ้าผู้เรียกระบุ prefetch มาเองอย่างชัดเจน ให้เคารพค่านั้น
  return <Link {...props} prefetch={prefetch ?? (allow ? undefined : false)} />;
}
