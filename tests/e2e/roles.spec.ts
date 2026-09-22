import { test, expect } from '@playwright/test';
import { STORAGE_STATE } from './helpers';

/**
 * หน้าบทบาทและสิทธิ์ — ผู้ดูแลระบบสูงสุดซ่อนบทบาทที่ยังไม่ใช้ได้
 *
 * เทสต์นี้เปลี่ยนสถานะในฐานข้อมูลจริง จึงคืนค่าเดิมให้ทุกกรณีก่อนจบ
 * ไม่อย่างนั้นเทสต์ไฟล์อื่นในชุดเดียวกันจะเห็นบทบาทหายไปแล้วล้มตามกัน
 */
test.describe('ซ่อนบทบาทที่ยังไม่ใช้', () => {
  test.use({ storageState: STORAGE_STATE.admin });

  test('ซ่อนบทบาทผู้อนุมัติแล้วหายจากรายการให้เลือกตอนเชิญผู้ใช้', async ({ page }) => {
    await page.goto('/admin/roles');
    const row = page.locator('div', { hasText: 'ผู้อนุมัติ' }).last();
    await expect(page.getByRole('heading', { name: 'บทบาทและสิทธิ์' })).toBeVisible();

    const hide = page.getByRole('button', { name: /^ซ่อน ผู้อนุมัติ$/ });
    const show = page.getByRole('button', { name: /^เปิดใช้งาน ผู้อนุมัติ$/ });

    try {
      await expect(hide).toBeVisible();
      await hide.click();
      await expect(show).toBeVisible();
      await expect(row).toContainText('ซ่อนอยู่');

      // รายการให้เลือกตอนเชิญผู้ใช้ต้องไม่มีบทบาทที่ถูกซ่อน
      await page.goto('/admin/users');
      await page.getByRole('button', { name: /เชิญผู้ใช้/ }).click();
      const picker = page.locator('#i-role');
      await expect(picker).toBeVisible();
      const options = await picker.locator('option').allTextContents();
      expect(options).not.toContain('ผู้อนุมัติ');
      expect(options).toContain('พนักงาน');
    } finally {
      // คืนสถานะเดิมเสมอ
      await page.goto('/admin/roles');
      const restore = page.getByRole('button', { name: /^เปิดใช้งาน ผู้อนุมัติ$/ });
      if (await restore.isVisible().catch(() => false)) await restore.click();
    }

    await expect(page.getByRole('button', { name: /^ซ่อน ผู้อนุมัติ$/ })).toBeVisible();
  });

  test('บทบาทหลักของระบบซ่อนไม่ได้ — ไม่มีปุ่มให้กด', async ({ page }) => {
    await page.goto('/admin/roles');
    await expect(page.getByRole('button', { name: /ซ่อน ผู้ดูแลระบบสูงสุด/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /ซ่อน พนักงาน/ })).toHaveCount(0);
    await expect(page.getByText('บทบาทหลักของระบบ ซ่อนไม่ได้').first()).toBeVisible();
  });
});

test.describe('สิทธิ์เข้าถึงหน้าบทบาท', () => {
  test.use({ storageState: STORAGE_STATE.employee });

  test('พนักงานเข้าหน้าบทบาทไม่ได้ — ถูกพากลับหน้าปฏิทิน', async ({ page }) => {
    await page.goto('/admin/roles');
    await page.waitForURL('**/calendar**');
    await expect(page.getByRole('heading', { name: 'บทบาทและสิทธิ์' })).toHaveCount(0);
  });

  test('เรียก API เปลี่ยนสถานะบทบาทตรง ๆ ต้องถูกปฏิเสธ', async ({ page }) => {
    const res = await page.request.patch('/api/admin/roles', {
      data: { code: 'approver', enabled: false },
    });
    expect([401, 403]).toContain(res.status());
  });
});
