import { test, expect } from '@playwright/test';
import { ACCOUNTS, STORAGE_STATE } from './helpers';

/**
 * ชื่อ/นามสกุลแยกช่อง แก้ชื่อตัวเองได้ทุกบัญชี แผนกให้ผู้ดูแลแก้ อีเมลห้ามแก้เด็ดขาด (ผู้ใช้ขอ 2 ต.ค. 2569)
 * ไม่เปลี่ยนชื่อบัญชีทดสอบจริง เพราะสเปกอื่นที่รันพร้อมกันตรวจชื่อนี้อยู่ — บันทึกค่าเดิมกลับแทน
 */
test.describe('โปรไฟล์ของตัวเอง', () => {
  test.use({ storageState: STORAGE_STATE.employee });

  test('ชื่อ/นามสกุลแยกช่อง แผนกและอีเมลแก้เองไม่ได้', async ({ page }) => {
    await page.goto('/profile');
    const [first, last] = ACCOUNTS.employee.name.split(' ');
    await expect(page.getByLabel('ชื่อ', { exact: true })).toHaveValue(first!);
    await expect(page.getByLabel('นามสกุล', { exact: true })).toHaveValue(last!);
    await expect(page.getByLabel('อีเมล', { exact: true })).toBeDisabled();
    await expect(page.getByLabel('แผนก', { exact: true })).toBeDisabled();

    // นามสกุลว่างบันทึกไม่ได้
    await page.getByLabel('นามสกุล', { exact: true }).fill('');
    await page.getByRole('button', { name: 'บันทึก', exact: true }).click();
    await expect(page.getByText('กรุณากรอกนามสกุล')).toBeVisible();

    // บันทึกค่าเดิมกลับ — ส่งแยกช่อง และไม่ส่งอีเมล/แผนก
    await page.getByLabel('นามสกุล', { exact: true }).fill(last!);
    const saved = page.waitForResponse((r) => r.url().endsWith('/api/profile') && r.request().method() === 'PUT');
    await page.getByRole('button', { name: 'บันทึก', exact: true }).click();
    const sent = (await saved).request().postDataJSON();
    expect(sent.firstName).toBe(first);
    expect(sent.lastName).toBe(last);
    expect(sent).not.toHaveProperty('email');
    expect(sent).not.toHaveProperty('department');
    await expect(page.getByText('บันทึกโปรไฟล์แล้ว')).toBeVisible();
  });

  test('ส่งอีเมลหรือแผนกมากับคำขอแก้โปรไฟล์ — ระบบไม่เปลี่ยนให้', async ({ page }) => {
    test.skip(test.info().project.name !== 'desktop', 'ตรวจที่ API ไม่ขึ้นกับขนาดจอ');
    await page.goto('/profile');
    const [first, last] = ACCOUNTS.employee.name.split(' ');
    const res = await page.request.put('/api/profile', {
      data: { firstName: first, lastName: last, email: 'hijack@example.com', department: 'แอบย้ายแผนก' },
    });
    expect(res.status()).toBe(200);
    await page.reload();
    await expect(page.getByLabel('อีเมล', { exact: true })).toHaveValue(ACCOUNTS.employee.email);
    await expect(page.getByLabel('แผนก', { exact: true })).not.toHaveValue('แอบย้ายแผนก');

    // พนักงานเรียก API ของผู้ดูแลเพื่อแก้แผนกตัวเองไม่ได้
    const users = await page.request.put('/api/admin/users/00000000-0000-0000-0000-000000000000/roles', {
      data: { roles: [], department: 'แอบย้ายแผนก' },
    });
    expect(users.status()).toBe(403);
  });
});

test.describe('ผู้ดูแลระบบ', () => {
  test.use({ storageState: STORAGE_STATE.admin });

  test('แก้แผนกของผู้ใช้คนอื่นได้ แต่อีเมลแก้ไม่ได้', async ({ page }) => {
    test.skip(test.info().project.name !== 'desktop', 'แก้ข้อมูลบัญชีร่วม ทำครั้งเดียวพอ');
    await page.goto('/admin/users');
    const row = page.getByRole('row', { name: new RegExp(ACCOUNTS.viewer.email) });
    await row.getByRole('button', { name: 'แก้ไข', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: `แก้ไข ${ACCOUNTS.viewer.name}` });
    await expect(dialog.getByLabel('อีเมล', { exact: true })).toBeDisabled();
    const dept = dialog.getByLabel('แผนก', { exact: true });
    const original = await dept.inputValue();

    await dept.fill('ประชาสัมพันธ์ (ทดสอบ)');
    await dialog.getByRole('button', { name: 'บันทึก', exact: true }).click();
    await expect(page.getByText('บันทึกแล้ว')).toBeVisible();
    await expect(row).toContainText('ประชาสัมพันธ์ (ทดสอบ)');

    // คืนค่าเดิม
    await row.getByRole('button', { name: 'แก้ไข', exact: true }).click();
    await dialog.getByLabel('แผนก', { exact: true }).fill(original);
    await dialog.getByRole('button', { name: 'บันทึก', exact: true }).click();
    await expect(row).toContainText(original);
  });
});
