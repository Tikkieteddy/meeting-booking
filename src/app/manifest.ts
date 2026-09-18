import type { MetadataRoute } from 'next';
import { t } from '@/lib/i18n';

/**
 * ไฟล์ manifest สำหรับติดตั้งเป็นแอฟบนหน้าจอหลัก (PWA)
 *
 * เว็บยังใช้งานได้ปกติทุกอย่างในเบราว์เซอร์ทั่วไป — ไฟล์นี้เป็นเพียง "ข้อมูลเพิ่ม"
 * ที่บอกระบบปฏิบัติการว่า ถ้าผู้ใช้อยากติดตั้งเป็นแอฟ ให้ใช้ชื่อและไอคอนชุดไหน
 * เบราว์เซอร์ที่ไม่รองรับจะเพิกเฉยต่อไฟล์นี้ ไม่มีผลกระทบใด ๆ
 *
 * Next.js เสิร์ฟไฟล์นี้ที่ /manifest.webmanifest และใส่ <link rel="manifest"> ให้เอง
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: t('app.name'),
    short_name: t('app.shortName'),
    description: t('app.tagline'),
    lang: 'th',
    dir: 'ltr',
    start_url: '/calendar',
    // standalone = เปิดแล้วไม่มีแถบ URL เหมือนแอฟที่ติดตั้ง
    // ถ้าระบบปฏิบัติการไม่รองรับจะถอยไปเปิดในแท็บเบราว์เซอร์ธรรมดาเอง
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#FAFAF9',
    theme_color: '#EC5F27',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // maskable = ให้ Android ตัดเป็นทรงไหนก็ได้โดยตัวอักษรไม่ถูกตัด
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    // ทางลัดที่กดค้างไอคอนแอฟแล้วเลือกได้เลย
    shortcuts: [
      { name: t('nav.calendar'), url: '/calendar' },
      { name: t('nav.myBookings'), url: '/bookings' },
    ],
  };
}
