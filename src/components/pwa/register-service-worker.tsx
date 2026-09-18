'use client';

import { useEffect } from 'react';

/**
 * ลงทะเบียน service worker — ทำให้เว็บเปิดซ้ำได้เร็วและติดตั้งเป็นแอฟได้
 *
 * เป็นการ "เพิ่มความสามารถ" ไม่ใช่ "เปลี่ยนวิธีทำงาน" (progressive enhancement)
 * เบราว์เซอร์ที่ไม่รองรับ หรือเปิดผ่าน http ที่ไม่ปลอดภัย จะข้ามส่วนนี้ไปเงียบ ๆ
 * และเว็บยังทำงานครบทุกฟีเจอร์เหมือนเดิม
 *
 * ไม่ลงทะเบียนตอน development เพราะการแคชไฟล์จะรบกวน hot reload
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    // service worker ทำงานได้เฉพาะ https หรือ localhost เท่านั้น
    if (!window.isSecureContext) return;

    let cancelled = false;
    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        if (cancelled) return;
        // เช็กว่ามีเวอร์ชันใหม่หรือไม่ทุกครั้งที่กลับมาเปิดแอฟ
        await registration.update().catch(() => {});
      } catch {
        // ลงทะเบียนไม่สำเร็จไม่ใช่เรื่องคอขาดบาดตาย — เว็บยังใช้งานได้ปกติ
        // จึงไม่แสดง error ให้ผู้ใช้เห็นและไม่เขียน log ที่อาจมีข้อมูลอ่อนไหว
      }
    };

    // รอให้หน้าโหลดเสร็จก่อน เพื่อไม่แย่งแบนด์วิดท์กับเนื้อหาที่ผู้ใช้กำลังรอดู
    if (document.readyState === 'complete') void register();
    else window.addEventListener('load', register, { once: true });

    return () => {
      cancelled = true;
      window.removeEventListener('load', register);
    };
  }, []);

  return null;
}
