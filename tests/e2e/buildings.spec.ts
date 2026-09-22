import { test, expect } from '@playwright/test';
import { STORAGE_STATE } from './helpers';

/**
 * เพิ่มอาคารจากหน้าจัดการห้อง แล้วอาคารต้องโผล่ในช่อง "อาคาร" ของฟอร์มห้องทันที
 * (ที่มา: ฐานข้อมูลจริงไม่มีอาคารเลย ทำให้ช่องอาคารเลือกอะไรไม่ได้)
 */
test.describe('จัดการอาคาร', () => {
  test.use({ storageState: STORAGE_STATE.admin });

  test('เพิ่มอาคารแล้วเลือกให้ห้องได้ทันที', async ({ page }) => {
    const code = `B-${Date.now().toString().slice(-6)}`;
    const name = `อาคารทดสอบ ${code}`;

    await page.goto('/admin/rooms');
    await page.getByRole('button', { name: /เพิ่มอาคาร/ }).click();
    const dialog = page.getByRole('dialog', { name: 'เพิ่มอาคาร' });
    await dialog.getByLabel('ชื่ออาคาร', { exact: true }).fill(name);
    await dialog.getByLabel('รหัสอาคาร', { exact: true }).fill(code);
    await dialog.getByRole('button', { name: 'บันทึก' }).click();
    await expect(page.getByText(/เพิ่มอาคารแล้ว/)).toBeVisible();

    // ต้องอยู่ในรายการอาคาร (ปุ่มแก้ไขที่มีชื่ออาคารเป็นข้อความ) และเป็นตัวเลือกในฟอร์มห้อง
    await expect(page.getByRole('button', { name: new RegExp(name) })).toBeVisible();
    await page.getByRole('button', { name: /เพิ่มห้องใหม่/ }).click();
    const roomDialog = page.getByRole('dialog', { name: 'เพิ่มห้องใหม่' });
    await expect(roomDialog.getByLabel('อาคาร', { exact: true }).locator('option', { hasText: name })).toHaveCount(1);
  });

  test('รหัสอาคารซ้ำต้องถูกปฏิเสธด้วยข้อความไทย', async ({ page }) => {
    const code = `DUP-${Date.now().toString().slice(-6)}`;
    const first = await page.request.post('/api/buildings', { data: { name: 'อาคาร A', code } });
    expect(first.status()).toBe(201);
    const second = await page.request.post('/api/buildings', { data: { name: 'อาคาร B', code: code.toLowerCase() } });
    expect(second.status()).toBe(409);
    expect((await second.json()).error.message).toContain('รหัสนี้');
  });
});

test.describe('สิทธิ์อาคาร', () => {
  test.use({ storageState: STORAGE_STATE.employee });

  test('พนักงานเรียก API เพิ่มอาคารต้องได้ 403', async ({ page }) => {
    const res = await page.request.post('/api/buildings', { data: { name: 'ลอบใส่', code: 'X1' } });
    expect(res.status()).toBe(403);
  });
});
