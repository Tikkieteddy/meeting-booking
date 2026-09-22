import { test, expect } from '@playwright/test';

/**
 * คำแนะนำการใช้งานต้องชี้ไปที่ของจริงบนหน้าจอ
 *
 * ใช้บัญชี seed ที่ยังไม่เคยล็อกอิน (user2) เพราะคำแนะนำจะเด้งเองสำหรับผู้ใช้ครั้งแรก
 * บัญชีที่ auth.setup.ts ใช้ไปแล้วถูกทำเครื่องหมายว่าผ่านคำแนะนำแล้ว จึงไม่เด้งอีก
 * (ฐานข้อมูลถูก seed ใหม่ทุกครั้งก่อนรันชุดเทสต์ ผลจึงทำซ้ำได้)
 */
const FIRST_TIME_USER = { email: 'user2@example.com', password: 'TnnDemo2569!' };

test.use({ storageState: { cookies: [], origins: [] } });

test('ชี้ไปที่ของจริงบนหน้าปฏิทิน และถอยเป็นกล่องกลางจอเมื่อไม่มีจุดให้ชี้', async ({ page }, testInfo) => {
  // ล็อกอินจริงหนึ่งครั้ง — ระบบจำกัดอัตราการล็อกอิน จึงรันแค่ project เดียว
  test.skip(testInfo.project.name !== 'desktop', 'ล็อกอินจริง — รันที่ project desktop เท่านั้น');

  await page.goto('/login');
  await page.getByLabel('อีเมล', { exact: true }).fill(FIRST_TIME_USER.email);
  await page.getByLabel('รหัสผ่าน', { exact: true }).fill(FIRST_TIME_USER.password);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
  await page.waitForURL('**/calendar**');

  const tour = page.getByRole('dialog', { name: 'แนะนำการใช้งาน' });
  await expect(tour).toBeVisible({ timeout: 15_000 });

  // ขั้นที่ 1 เป็นคำทักทาย ไม่ชี้จุดไหน จึงต้องอยู่กลางจอ
  await expect(tour).toHaveAttribute('data-tour-card', 'centered');
  await expect(tour).toContainText('ขั้นที่ 1 จาก 10');

  // ขั้นที่ 2 ชี้ไปที่แถบเปลี่ยนวันที่ — ต้องเกาะกับของจริง และอยู่ใกล้กันบนหน้าจอ
  await tour.getByRole('button', { name: 'ถัดไป' }).click();
  await expect(tour).toHaveAttribute('data-tour-card', 'anchored');

  const dateNav = page.locator('[data-tour="datenav"]');
  const targetBox = await dateNav.boundingBox();
  const cardBox = await tour.boundingBox();
  expect(targetBox, 'ต้องมีแถบเปลี่ยนวันที่อยู่บนหน้า').toBeTruthy();
  expect(cardBox).toBeTruthy();
  // กล่องคำอธิบายต้องอยู่ห่างจากจุดที่ชี้ไม่เกินหนึ่งช่วงจอ ไม่ใช่ลอยอยู่คนละมุม
  const gapY = Math.abs(cardBox!.y - (targetBox!.y + targetBox!.height));
  expect(gapY).toBeLessThan(260);

  // ขั้นที่ 4 ชี้ไปที่สวิตช์มุมมอง วัน/สัปดาห์/เดือน
  await tour.getByRole('button', { name: 'ถัดไป' }).click();
  await tour.getByRole('button', { name: 'ถัดไป' }).click();
  await expect(tour).toContainText('สลับมุมมอง');
  await expect(tour).toHaveAttribute('data-tour-card', 'anchored');

  // กด Escape = ข้าม เหมือน dialog อื่นในระบบ
  await page.keyboard.press('Escape');
  await expect(tour).toBeHidden();
});
