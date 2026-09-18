import { expect, test } from '@playwright/test';
import { STORAGE_STATE, openCalendar } from './helpers';

/**
 * เทสต์ของการติดตั้งเป็นแอฟ (PWA)
 *
 * หัวใจของชุดนี้คือเทสต์ข้อที่สอง: พิสูจน์ว่า service worker "ไม่" เก็บข้อมูล
 * ของผู้ใช้ไว้ในเครื่อง ถ้าวันหนึ่งมีคนแก้ public/sw.js ให้แคชหน้า HTML เพื่อให้
 * เว็บเร็วขึ้น เทสต์นี้ต้องแดงทันที เพราะนั่นคือการทำข้อมูลส่วนบุคคลรั่วบนเครื่อง
 * ที่ใช้ร่วมกัน
 */

/** พาธที่อนุญาตให้แคชได้: ไฟล์ static ที่มี hash, ไอคอน, และหน้าออฟไลน์ */
const CACHEABLE = /^\/(_next\/static\/|icons\/|offline$)/;

test.use({ storageState: STORAGE_STATE.employee });

async function waitForServiceWorker(page: import('@playwright/test').Page) {
  await page.waitForFunction(() => navigator.serviceWorker?.controller !== null, null, { timeout: 30_000 });
}

test.describe('ติดตั้งเป็นแอฟบนมือถือ (PWA)', () => {
  test('manifest และไอคอนทุกขนาดเข้าถึงได้จริง', async ({ page }) => {
    await openCalendar(page);

    // หน้าเว็บต้องประกาศ manifest และไอคอนให้ระบบปฏิบัติการเห็น
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest');
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
    await expect(page.locator('link[rel="icon"]')).toHaveCount(1);

    const manifest = await page.request.get('/manifest.webmanifest');
    expect(manifest.ok()).toBeTruthy();
    const body = await manifest.json();
    expect(body.name).toContain('TNN');
    expect(body.display).toBe('standalone');
    expect(body.start_url).toBe('/calendar');

    // ต้องมีไอคอน maskable ไม่อย่างนั้น Android จะครอปตัวอักษรขาด
    const purposes = body.icons.map((i: { purpose?: string }) => i.purpose);
    expect(purposes).toContain('maskable');

    for (const icon of body.icons as { src: string }[]) {
      const res = await page.request.get(icon.src);
      expect(res.ok(), `ไอคอน ${icon.src} ต้องโหลดได้`).toBeTruthy();
      expect(res.headers()['content-type']).toContain('image/png');
    }
  });

  test('service worker แคชเฉพาะไฟล์ static — ห้ามแคชข้อมูลของผู้ใช้', async ({ page }) => {
    await openCalendar(page);
    await waitForServiceWorker(page);

    // โหลดซ้ำเพื่อให้คำขอไฟล์ static ผ่านมือ service worker
    await page.reload();
    await openCalendar(page);

    const cached = await page.evaluate(async () => {
      const names = await caches.keys();
      const paths: string[] = [];
      for (const name of names) {
        const cache = await caches.open(name);
        for (const req of await cache.keys()) paths.push(new URL(req.url).pathname);
      }
      return paths;
    });

    // ต้องแคชไฟล์ static ได้จริง ไม่อย่างนั้นการติดตั้งเป็นแอฟก็ไม่ได้ช่วยอะไร
    expect(cached.filter((p) => p.startsWith('/_next/static/')).length).toBeGreaterThan(0);
    expect(cached, 'ต้องเตรียมหน้าออฟไลน์ไว้ล่วงหน้า').toContain('/offline');

    // ── ข้อห้าม ──
    expect(cached.filter((p) => !CACHEABLE.test(p)), 'มีรายการที่ไม่ควรถูกแคช').toEqual([]);
    expect(cached.filter((p) => p.startsWith('/api/')), 'ห้ามแคชคำตอบจาก API').toEqual([]);
    expect(cached.filter((p) => ['/', '/calendar', '/bookings', '/login'].includes(p)),
      'ห้ามแคชหน้า HTML ที่มีข้อมูลผู้ใช้').toEqual([]);
  });

  test('เน็ตล่มแล้วยังเห็นหน้าอธิบายภาษาไทย ไม่ใช่หน้า error ของเบราว์เซอร์', async ({ page, context }) => {
    await openCalendar(page);
    await waitForServiceWorker(page);

    await context.setOffline(true);
    await page.goto('/calendar').catch(() => {});

    await expect(page.getByRole('heading', { name: 'ขณะนี้ออฟไลน์' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'เปิดหน้าตารางการจองใหม่' })).toBeVisible();

    await context.setOffline(false);
  });

  test('หน้าช่วยเหลือบอกวิธีติดตั้งครบทั้ง Android, iOS และคอมพิวเตอร์', async ({ page }) => {
    await page.goto('/help');
    const section = page.getByRole('heading', { name: 'ติดตั้งเป็นแอฟบนมือถือ' });
    await expect(section).toBeVisible();
    await expect(page.getByText(/เพิ่มลงในหน้าจอหลัก/)).toBeVisible();
    await expect(page.getByText(/เพิ่มไปยังหน้าจอโฮม/)).toBeVisible();
    await expect(page.getByText(/กดไอคอนรูปจอมีลูกศรลง/)).toBeVisible();
  });
});

/**
 * กรณีที่ service worker ใช้งานไม่ได้เลย — เบราว์เซอร์รุ่นเก่า เปิดในโหมดส่วนตัว
 * หรือฝ่าย IT บล็อกไว้ เว็บต้องยังทำงานครบทุกฟีเจอร์ นี่คือหลักการ
 * progressive enhancement ที่ข้อกำหนดของงานนี้ระบุไว้
 *
 * ใช้ serviceWorkers: 'block' ของ Playwright เพราะ page.route() ดักคำขอไฟล์
 * service worker ไม่ได้ — เบราว์เซอร์ขอไฟล์นั้นนอกบริบทของหน้าเว็บ
 */
test.describe('กรณีใช้ service worker ไม่ได้', () => {
  test.use({ storageState: STORAGE_STATE.employee, serviceWorkers: 'block' });

  test('เว็บใช้งานได้ครบแม้ service worker ถูกปิด', async ({ page }) => {
    await openCalendar(page);
    await expect(page.getByRole('tab', { name: 'มุมมองรายสัปดาห์' })).toBeVisible();

    const controlled = await page.evaluate(() => navigator.serviceWorker?.controller !== null);
    expect(controlled, 'ไม่ควรมี service worker ควบคุมหน้าในกรณีนี้').toBeFalsy();

    // และต้องไม่มีอะไรถูกเก็บลงเครื่องเลย
    const cacheCount = await page.evaluate(async () => (await caches.keys()).length);
    expect(cacheCount).toBe(0);
  });
});
