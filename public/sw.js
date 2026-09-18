/*
 * Service Worker ของระบบจองห้องประชุม TNN
 *
 * ==========================================================================
 *  กฎความปลอดภัยข้อสำคัญที่สุดของไฟล์นี้ — อ่านก่อนแก้
 * ==========================================================================
 *  ห้ามแคชหน้า HTML ที่มีข้อมูลผู้ใช้ และห้ามแคชคำตอบจาก /api/ เด็ดขาด
 *
 *  เหตุผล: หน้าเว็บของระบบนี้ถูกประกอบที่เซิร์ฟเวอร์พร้อมข้อมูลของผู้ที่ล็อกอิน
 *  อยู่ (ชื่อ อีเมล รายการประชุม สิทธิ์) ถ้าแคชไว้ในเครื่อง แล้วเครื่องนั้นเป็น
 *  เครื่องที่ใช้ร่วมกัน (เช่น แท็บเล็ตหน้าห้องประชุม) คนถัดไปที่เปิดอาจเห็น
 *  หน้าที่แคชไว้ของคนก่อน — เป็นการรั่วไหลของข้อมูลส่วนบุคคลทั้งที่ล็อกเอาต์แล้ว
 *
 *  สิ่งที่แคชได้อย่างปลอดภัยคือไฟล์ที่ไม่มีข้อมูลใครเลยและเปลี่ยนชื่อทุกครั้งที่
 *  build ใหม่ (/_next/static/...) กับไอคอนและหน้าออฟไลน์
 * ==========================================================================
 *
 * ผลที่ได้: เปิดซ้ำครั้งที่สองขึ้นไปเร็วขึ้นมาก เพราะ JavaScript และ CSS
 * ถูกอ่านจากเครื่องแทนการโหลดใหม่ ส่วนข้อมูลการจองยังดึงสดจากเซิร์ฟเวอร์ทุกครั้ง
 */

const STATIC_CACHE = 'tnn-static-v1';
const SHELL_CACHE = 'tnn-shell-v1';
const KEEP = [STATIC_CACHE, SHELL_CACHE];

const OFFLINE_URL = '/offline';
const PRECACHE = [
  OFFLINE_URL,
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
];

/** จำนวนไฟล์ static สูงสุดที่เก็บไว้ — กันไม่ให้แคชโตไม่จำกัดหลัง deploy หลายรอบ */
const MAX_STATIC_ENTRIES = 80;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const shell = await caches.open(SHELL_CACHE);
      // ใช้ reload เพื่อไม่ให้ไปหยิบของเก่าจาก HTTP cache ของเบราว์เซอร์
      await Promise.allSettled(PRECACHE.map((url) => shell.add(new Request(url, { cache: 'reload' }))));
      // เริ่มทำงานทันทีโดยไม่ต้องรอปิดแท็บเก่า — ปลอดภัยเพราะเราแคชเฉพาะไฟล์
      // ที่ชื่อเปลี่ยนทุก build อยู่แล้ว จึงไม่มีทางจับคู่ผิดเวอร์ชัน
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => !KEEP.includes(n)).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

/** ตัดไฟล์เก่าสุดออกเมื่อแคชเกินโควตา (keys() เรียงตามลำดับที่ใส่เข้าไป) */
async function trim(cache, max) {
  const keys = await cache.keys();
  if (keys.length <= max) return;
  await Promise.all(keys.slice(0, keys.length - max).map((k) => cache.delete(k)));
}

/** ไฟล์ static ของ Next.js — ชื่อไฟล์มี hash จึงแคชแบบถาวรได้ ไม่มีวันจับคู่ผิด */
async function staticFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) {
    await cache.put(request, res.clone());
    await trim(cache, MAX_STATIC_ENTRIES);
  }
  return res;
}

/** เปิดหน้าเว็บ — ต่อเน็ตทุกครั้ง ถ้าเน็ตล่มจึงค่อยแสดงหน้าออฟไลน์ */
async function navigateOrOffline(request) {
  try {
    return await fetch(request);
  } catch {
    const shell = await caches.open(SHELL_CACHE);
    const offline = await shell.match(OFFLINE_URL);
    if (offline) return offline;
    return new Response('ออฟไลน์ — กรุณาเชื่อมต่ออินเทอร์เน็ตแล้วลองใหม่', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

/** อัปเดตหน้าออฟไลน์ที่แคชไว้ให้ตรงกับ build ล่าสุด — ทำครั้งเดียวต่ออายุ worker */
let shellRefreshed = false;
async function refreshShell() {
  if (shellRefreshed) return;
  shellRefreshed = true;
  try {
    const shell = await caches.open(SHELL_CACHE);
    await shell.add(new Request(OFFLINE_URL, { cache: 'reload' }));
  } catch {
    // อัปเดตไม่ได้ก็ไม่เป็นไร ของเดิมยังใช้ได้
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // แตะเฉพาะการอ่าน (GET) — การส่งข้อมูล (POST/PATCH/DELETE) ปล่อยผ่านทั้งหมด
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // ข้ามคำขอไปโดเมนอื่น
  if (url.origin !== self.location.origin) return;

  // ── ห้ามแตะ API เด็ดขาด: เป็นข้อมูลสดและเป็นข้อมูลของผู้ใช้ ──
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(navigateOrOffline(request));
    event.waitUntil(refreshShell());
    return;
  }

  // ไฟล์ที่มี hash ในชื่อ (JS/CSS ของ Next) และไอคอน — แคชได้ ไม่มีข้อมูลผู้ใช้
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(staticFirst(request));
    return;
  }

  // อย่างอื่นทั้งหมด (รวมถึง HTML ที่ client-side routing ดึงมา) ปล่อยผ่านไปเน็ต
  // ไม่แคช เพราะอาจมีข้อมูลของผู้ใช้อยู่ข้างใน
});
