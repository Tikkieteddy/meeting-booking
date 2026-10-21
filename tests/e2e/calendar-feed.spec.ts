import { test, expect } from '@playwright/test';
import { STORAGE_STATE } from './helpers';

/**
 * ลิงก์ปฏิทินส่วนตัวสำหรับ Outlook / Teams (ADR-020)
 * Outlook ดึงลิงก์โดยไม่มี cookie — เทสต์จึงเปิดลิงก์จาก context ที่ไม่ได้ล็อกอิน
 */
test.use({ storageState: STORAGE_STATE.employee });

test('สร้างลิงก์ปฏิทิน เปิดได้โดยไม่ต้องล็อกอิน และสร้างใหม่แล้วลิงก์เดิมใช้ไม่ได้', async ({ page, browser }) => {
  test.skip(test.info().project.name !== 'desktop', 'เปลี่ยนสถานะลิงก์ของบัญชีร่วม ทำครั้งเดียวพอ');
  await page.goto('/profile');
  await page.getByRole('tab', { name: 'ตั้งค่าการแจ้งเตือน' }).click();
  const card = page.getByRole('region', { name: 'ปฏิทิน Outlook / Teams' });

  // เริ่มจากสถานะใดก็ได้ (บัญชีร่วม) — ถ้ามีลิงก์อยู่แล้วให้สร้างใหม่ผ่านหน้าต่างยืนยัน
  const rotate = card.getByRole('button', { name: 'สร้างลิงก์ใหม่' });
  if (await rotate.isVisible()) {
    await rotate.click();
    await page.getByRole('dialog', { name: 'สร้างลิงก์ปฏิทินใหม่?' }).getByRole('button', { name: 'ยืนยัน' }).click();
  } else {
    await card.getByRole('button', { name: 'สร้างลิงก์ปฏิทิน' }).click();
  }
  const linkBox = card.getByLabel('ลิงก์ปฏิทินส่วนตัว');
  await expect(linkBox).toBeVisible();
  const firstUrl = await linkBox.inputValue();
  expect(firstUrl).toMatch(/\/api\/calendar-feed\/[A-Za-z0-9_-]{43}\.ics$/);
  await expect(card.getByRole('link', { name: 'เปิดใน Outlook บนเครื่อง' })).toHaveAttribute('href', /^webcal:\/\//);

  const anon = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  try {
    const feed = await anon.request.get(new URL(firstUrl).pathname);
    expect(feed.status()).toBe(200);
    expect(feed.headers()['content-type']).toContain('text/calendar');
    expect(feed.headers()['cache-control']).toContain('no-store');
    expect(await feed.text()).toContain('BEGIN:VCALENDAR');

    // สร้างใหม่ → ลิงก์เดิมตายทันที
    await card.getByRole('button', { name: 'สร้างลิงก์ใหม่' }).click();
    await page.getByRole('dialog', { name: 'สร้างลิงก์ปฏิทินใหม่?' }).getByRole('button', { name: 'ยืนยัน' }).click();
    await expect(linkBox).not.toHaveValue(firstUrl);
    expect((await anon.request.get(new URL(firstUrl).pathname)).status()).toBe(404);

    // ปิดลิงก์ → ลิงก์ใหม่ก็ตาย
    const secondUrl = await linkBox.inputValue();
    await card.getByRole('button', { name: 'ปิดลิงก์' }).click();
    await page.getByRole('dialog', { name: 'ปิดลิงก์ปฏิทิน?' }).getByRole('button', { name: 'ยืนยัน' }).click();
    await expect(card.getByRole('button', { name: 'สร้างลิงก์ปฏิทิน' })).toBeVisible();
    expect((await anon.request.get(new URL(secondUrl).pathname)).status()).toBe(404);

    // ไม่ได้ล็อกอิน จัดการลิงก์ไม่ได้
    expect((await anon.request.post('/api/profile/calendar-feed')).status()).toBe(401);
  } finally {
    await anon.close();
  }
});
