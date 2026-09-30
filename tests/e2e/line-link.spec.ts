import { test, expect } from '@playwright/test';
import { STORAGE_STATE } from './helpers';

/**
 * หน้าโปรไฟล์ → ตั้งค่าการแจ้งเตือน → ขอรหัสเชื่อม LINE แล้วกด "คัดลอก"
 * รหัสต้องเข้าคลิปบอร์ดจริง และปุ่มเปลี่ยนเป็น "คัดลอกแล้ว" ให้ผู้ใช้รู้ว่าสำเร็จ
 */
test.use({ storageState: STORAGE_STATE.viewer, permissions: ['clipboard-read', 'clipboard-write'] });

test('ขอรหัสเชื่อม LINE แล้วกดคัดลอก รหัสเข้าคลิปบอร์ดจริง', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'สิทธิ์คลิปบอร์ดตั้งได้แน่นอนใน desktop project');
  await page.goto('/profile');
  await page.getByRole('tab', { name: 'ตั้งค่าการแจ้งเตือน' }).click();
  await page.getByRole('button', { name: 'ขอรหัสเชื่อมบัญชี' }).click();

  const copy = page.getByRole('button', { name: 'คัดลอก', exact: true });
  await expect(copy).toBeVisible();
  const code = (await page.locator('.select-all').first().textContent())?.trim() ?? '';
  expect(code).toMatch(/^[A-Z0-9]{8}$/);

  await copy.click();
  await expect(page.getByRole('button', { name: /คัดลอกแล้ว/ })).toBeVisible();
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip).toBe(code);
  await expect(page.getByText('TNN จองห้องประชุม', { exact: false })).toBeVisible();
});
