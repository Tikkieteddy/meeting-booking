import { test, expect } from '@playwright/test';
import { ACCOUNTS } from './helpers';

/**
 * เทสต์หน้าเข้าสู่ระบบและสร้างบัญชี — เฉพาะส่วนที่ผู้ใช้กดเอง
 *
 * ทุกเทสต์ในไฟล์นี้ต้องอยู่ในสถานะ "ยังไม่ล็อกอิน" เพราะหน้า /login และ /register
 * จะเด้งไปหน้าปฏิทินทันทีถ้ามี session อยู่แล้ว จึงล้าง storageState ทิ้งทั้งไฟล์
 */
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('ช่องรหัสผ่านมีปุ่มรูปตา', () => {
  for (const [name, path] of [
    ['หน้าเข้าสู่ระบบ', '/login'],
    ['หน้าสร้างบัญชี', '/register'],
  ] as const) {
    test(`${name}: กดปุ่มแล้วเห็นสิ่งที่พิมพ์ กดอีกครั้งกลับไปซ่อน`, async ({ page }) => {
      await page.goto(path);
      const password = page.getByLabel('รหัสผ่าน', { exact: true });
      await password.fill('SuperSecret123');

      // ค่าเริ่มต้นต้องซ่อนไว้เสมอ
      await expect(password).toHaveAttribute('type', 'password');

      const show = page.getByRole('button', { name: 'แสดงรหัสผ่าน' });
      await expect(show).toBeVisible();
      await show.click();

      // เห็นข้อความจริง และชื่อปุ่มต้องเปลี่ยนเป็น "ซ่อน" เพื่อบอกสิ่งที่จะเกิดขึ้นถ้ากดต่อ
      await expect(password).toHaveAttribute('type', 'text');
      await expect(password).toHaveValue('SuperSecret123');
      const hide = page.getByRole('button', { name: 'ซ่อนรหัสผ่าน' });
      await expect(hide).toBeVisible();

      await hide.click();
      await expect(password).toHaveAttribute('type', 'password');
    });
  }
});

test('ป้ายชื่อช่องอีเมลคือคำว่า "อีเมล"', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByLabel('อีเมล', { exact: true })).toBeVisible();
  // ป้ายเดิมต้องไม่เหลืออยู่ที่ไหนในหน้า
  await expect(page.getByText('อีเมลองค์กร')).toHaveCount(0);
});

test('ช่องจำการเข้าสู่ระบบเริ่มต้นต้องไม่ติ๊ก และชื่อที่ screen reader อ่านต้องตรงกับที่ตาเห็น', async ({ page }) => {
  await page.goto('/login');
  const remember = page.getByRole('checkbox', { name: 'จำการเข้าสู่ระบบไว้', exact: true });
  await expect(remember).toBeVisible();
  await expect(remember).not.toBeChecked();
  await remember.check();
  await expect(remember).toBeChecked();
});

test('ติ๊กจำการเข้าสู่ระบบแล้ว cookie ต้องอยู่ยาวกว่าหนึ่งวัน', async ({ page }, testInfo) => {
  /*
   * ล็อกอินจริงหนึ่งครั้ง จึงจำกัดให้รันแค่ project เดียว
   * ระบบจำกัดอัตราการล็อกอินไว้ 8 ครั้งต่อ 15 นาทีต่ออีเมล (กัน brute force)
   * ถ้ารันทั้ง 4 ขนาดหน้าจอจะกินโควตาไปเปล่า ๆ และอาจทำให้ชุดเทสต์อื่นล้ม
   */
  test.skip(testInfo.project.name !== 'desktop', 'ล็อกอินจริง — รันที่ project desktop เท่านั้น');

  const account = ACCOUNTS.viewer;
  await page.goto('/login');
  await page.getByLabel('อีเมล', { exact: true }).fill(account.email);
  await page.getByLabel('รหัสผ่าน', { exact: true }).fill(account.password);
  await page.getByRole('checkbox', { name: 'จำการเข้าสู่ระบบไว้', exact: true }).check();
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
  await page.waitForURL('**/calendar**');

  const cookie = (await page.context().cookies()).find((c) => c.name === 'tnn_session');
  expect(cookie, 'ต้องมี cookie เซสชันหลังล็อกอินสำเร็จ').toBeTruthy();

  // ค่าปกติ (ไม่ติ๊ก) คือ 12 ชั่วโมง — ถ้าธง remember ไม่ถูกส่งไปถึงเซิร์ฟเวอร์ เทสต์นี้จะแดง
  const daysLeft = (cookie!.expires * 1000 - Date.now()) / 86_400_000;
  expect(daysLeft).toBeGreaterThan(1);
});
