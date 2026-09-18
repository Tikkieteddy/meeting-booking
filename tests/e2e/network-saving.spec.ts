import { expect, test } from '@playwright/test';
import { STORAGE_STATE, openCalendar } from './helpers';

/**
 * เทสต์การประหยัดเน็ตของผู้ใช้
 *
 * Next.js จะโหลดหน้าถัดไปล่วงหน้า (prefetch) ให้ทันทีที่ลิงก์ปรากฏบนจอ
 * เมนูของระบบนี้อยู่ทุกหน้าและมีหลายลิงก์ บนเน็ตมือถือจึงกินเน็ตฟรีไปเรื่อย ๆ
 * SmartLink (src/components/ui/smart-link.tsx) จะปิดพฤติกรรมนี้เมื่อผู้ใช้
 * เปิดโหมดประหยัดเน็ต หรือเน็ตช้ากว่า 4G
 *
 * วิธีตรวจ: นับคำขอที่มี header `Next-Router-Prefetch` ซึ่ง Next ใส่มาให้
 * เฉพาะคำขอที่เป็นการโหลดล่วงหน้า ไม่ใช่การเปิดหน้าจริง
 */

/** ปลอมข้อมูลเครือข่ายที่เบราว์เซอร์รายงาน เพื่อจำลองสภาพเน็ตของผู้ใช้ */
function fakeNetwork(saveData: boolean, effectiveType = '4g') {
  return `Object.defineProperty(navigator, 'connection', {
    configurable: true,
    value: { saveData: ${saveData}, effectiveType: '${effectiveType}',
             addEventListener() {}, removeEventListener() {} },
  });`;
}

async function countPrefetches(page: import('@playwright/test').Page) {
  const seen: string[] = [];
  page.on('request', (request) => {
    if (request.headers()['next-router-prefetch']) seen.push(new URL(request.url()).pathname);
  });
  await openCalendar(page);
  // prefetch เกิดตอนลิงก์เข้ามาในจอ จึงต้องรอให้เมนูแสดงผลเสร็จก่อน
  await page.waitForTimeout(2500);
  return seen;
}

test.describe('ประหยัดเน็ตของผู้ใช้', () => {
  test.use({ storageState: STORAGE_STATE.employee, serviceWorkers: 'block' });

  test('เน็ตปกติ — ยังโหลดหน้าถัดไปล่วงหน้าเพื่อให้กดแล้วไว', async ({ page }) => {
    await page.addInitScript(fakeNetwork(false));
    const prefetched = await countPrefetches(page);
    expect(prefetched.length, 'เน็ตเร็วควรยังได้ประโยชน์จากการโหลดล่วงหน้า').toBeGreaterThan(0);
  });

  test('เปิดโหมดประหยัดเน็ต — ต้องไม่โหลดหน้าถัดไปล่วงหน้าเลย', async ({ page }) => {
    await page.addInitScript(fakeNetwork(true));
    const prefetched = await countPrefetches(page);
    expect(prefetched, 'โหมดประหยัดเน็ตต้องไม่มีการโหลดล่วงหน้า').toEqual([]);
  });

  test('เน็ตช้ากว่า 4G — ต้องไม่โหลดหน้าถัดไปล่วงหน้าเลย', async ({ page }) => {
    await page.addInitScript(fakeNetwork(false, '3g'));
    const prefetched = await countPrefetches(page);
    expect(prefetched, 'เน็ต 3G ต้องไม่มีการโหลดล่วงหน้า').toEqual([]);
  });

  test('เบราว์เซอร์ที่ไม่บอกข้อมูลเครือข่าย — ทำตัวเหมือนเดิมทุกอย่าง', async ({ page }) => {
    // Safari และ Firefox ไม่มี navigator.connection — ต้องไม่ถูกลงโทษ
    await page.addInitScript(`Object.defineProperty(navigator, 'connection', { configurable: true, value: undefined });`);
    const prefetched = await countPrefetches(page);
    expect(prefetched.length, 'ไม่มีข้อมูลเครือข่าย ให้ถือว่าเน็ตปกติ').toBeGreaterThan(0);
  });
});
