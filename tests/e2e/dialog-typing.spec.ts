import { test, expect } from '@playwright/test';
import { STORAGE_STATE } from './helpers';

/**
 * บั๊กที่ผู้ใช้เจอจริง: พิมพ์ในกล่อง "เพิ่มห้องใหม่" 1 ตัว แล้ว focus กระโดดไปปุ่ม ✕
 * สาเหตุอยู่ที่ตัวกล่องกลาง (Overlay) จึงทดสอบผ่านหน้าเพิ่มห้องซึ่งเป็นจุดที่พบ
 */
test.describe('พิมพ์ในกล่องโต้ตอบแล้ว focus ต้องอยู่ที่เดิม', () => {
  test.use({ storageState: STORAGE_STATE.admin });

  test('พิมพ์รหัสห้องหลายตัวติดกัน ตัวอักษรครบและ focus ไม่หนีไปปุ่มปิด', async ({ page }) => {
    await page.goto('/admin/rooms');
    await page.getByRole('button', { name: /เพิ่มห้อง/ }).first().click();

    const code = page.getByLabel('รหัสห้อง', { exact: true });
    await expect(code).toBeVisible();
    await code.click();
    await code.selectText().catch(() => {});

    // พิมพ์ทีละตัวเหมือนคนจริง — ถ้า focus หนีระหว่างทาง ตัวอักษรจะหาย
    await page.keyboard.type('TNN-A-301', { delay: 40 });

    await expect(code).toHaveValue('TNN-A-301');
    await expect(code).toBeFocused();
    await expect(page.getByRole('button', { name: 'ปิดหน้าต่าง' })).not.toBeFocused();

    // พิมพ์ต่อในช่องถัดไปก็ต้องไม่หนีเช่นกัน
    const name = page.getByLabel('ชื่อห้อง', { exact: true });
    await name.click();
    await page.keyboard.type('ห้องทดสอบ', { delay: 40 });
    await expect(name).toHaveValue('ห้องทดสอบ');
    await expect(name).toBeFocused();
  });
});
