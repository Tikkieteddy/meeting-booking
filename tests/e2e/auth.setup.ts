import { test as setup, expect } from '@playwright/test';
import { ACCOUNTS, STORAGE_STATE, dismissTutorial } from './helpers';

/**
 * ล็อกอินครั้งเดียวต่อบทบาท แล้วเก็บ session ไว้ให้เทสต์อื่นใช้ร่วมกัน
 *
 * ทำแบบนี้เพราะระบบจำกัดอัตราการล็อกอินไว้ 8 ครั้งต่อ 15 นาทีต่ออีเมล (กัน brute force)
 * ถ้าเทสต์ล็อกอินใหม่ทุกครั้ง จะไปติด rate limit ของระบบเองแล้วเทสต์ล้มทั้งชุด
 * — ซึ่งเป็นพฤติกรรมที่ถูกต้องของระบบ ไม่ใช่บั๊ก
 */
for (const role of Object.keys(ACCOUNTS) as (keyof typeof ACCOUNTS)[]) {
  setup(`ล็อกอินและเก็บ session: ${role}`, async ({ page }) => {
    const account = ACCOUNTS[role];
    await page.goto('/login');
    await page.getByLabel('อีเมล', { exact: true }).fill(account.email);
    await page.getByLabel('รหัสผ่าน', { exact: true }).fill(account.password);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();

    await page.waitForURL('**/calendar**');
    await dismissTutorial(page);
    await expect(page.getByRole('tab', { name: 'มุมมองรายวัน' })).toBeVisible();

    await page.context().storageState({ path: STORAGE_STATE[role] });
  });
}
