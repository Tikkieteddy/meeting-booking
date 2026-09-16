import { expect, test } from '@playwright/test';
import { STORAGE_STATE, expectNoHorizontalScroll, openCalendar } from './helpers';

test.use({ storageState: STORAGE_STATE.employee });

test.describe('หน้าปฏิทินหลัก', () => {
  test.beforeEach(async ({ page }) => {
    await openCalendar(page);
  });

  test('AC01 — สลับมุมมองแล้วเปลี่ยนทีละมุมมอง ไม่แสดงสามมุมมองพร้อมกัน', async ({ page }) => {
    const day = page.getByRole('tab', { name: 'มุมมองรายวัน' });
    const week = page.getByRole('tab', { name: 'มุมมองรายสัปดาห์' });
    const month = page.getByRole('tab', { name: 'มุมมองรายเดือน' });

    await expect(day).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('region', { name: 'ปฏิทินวัน' })).toBeVisible();
    // มีพื้นที่ปฏิทินเพียงชุดเดียวบนหน้าจอเสมอ
    await expect(page.locator('section[aria-label^="ปฏิทิน"]')).toHaveCount(1);

    await week.click();
    await expect(week).toHaveAttribute('aria-selected', 'true');
    await expect(day).toHaveAttribute('aria-selected', 'false');
    await expect(page.locator('section[aria-label^="ปฏิทิน"]')).toHaveCount(1);
    await expect(page.getByRole('region', { name: 'ปฏิทินสัปดาห์' })).toBeVisible();

    await month.click();
    await expect(month).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('section[aria-label^="ปฏิทิน"]')).toHaveCount(1);
    await expect(page.getByRole('region', { name: 'ปฏิทินเดือน' })).toBeVisible();

    // Month View มีคำอธิบายจุดสี 4 ระดับ
    for (const label of ['ว่าง', 'มีจองบางช่วง', 'ใกล้เต็ม', 'เต็ม']) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }
  });

  test('ห้องที่เลือกและวันที่คงค่าเดิมขณะสลับมุมมอง และเก็บไว้ใน URL', async ({ page }) => {
    const roomPicker = page.getByLabel('เลือกห้องประชุม');
    const roomValue = await roomPicker.locator('option').nth(1).getAttribute('value');
    await roomPicker.selectOption(roomValue!);

    const dateInput = page.getByLabel('วันที่', { exact: true });
    await dateInput.fill('2026-12-15');
    await expect(dateInput).toHaveValue('2026-12-15');

    await page.getByRole('tab', { name: 'มุมมองรายสัปดาห์' }).click();
    await expect(page).toHaveURL(/date=2026-12-15/);
    await expect(roomPicker).toHaveValue(roomValue!);
    await expect(dateInput).toHaveValue('2026-12-15');

    await page.getByRole('tab', { name: 'มุมมองรายเดือน' }).click();
    await expect(roomPicker).toHaveValue(roomValue!);
    await expect(dateInput).toHaveValue('2026-12-15');
    await expect(page).toHaveURL(/view=month/);
    await expect(page).toHaveURL(new RegExp(`room=${roomValue}`));
  });

  test('มุมมองเดือนกดวันแล้วเปิดมุมมองรายวันของวันนั้น', async ({ page }) => {
    await page.getByRole('tab', { name: 'มุมมองรายเดือน' }).click();
    await expect(page.getByRole('region', { name: 'ปฏิทินเดือน' })).toBeVisible();

    const dayCell = page.locator('button[aria-label^="20"]').nth(10);
    const label = await dayCell.getAttribute('aria-label');
    const dateISO = label!.slice(0, 10);
    await dayCell.click();

    await expect(page.getByRole('tab', { name: 'มุมมองรายวัน' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByLabel('วันที่', { exact: true })).toHaveValue(dateISO);
  });

  test('AC09 — หน้าหลักใช้งานได้โดยไม่ต้องเลื่อนหน้า', async ({ page }) => {
    await expect(page.getByRole('button', { name: /จอง/ }).first()).toBeVisible();
    await expect(page.getByLabel('เลือกห้องประชุม')).toBeVisible();
    await expect(page.getByRole('tab', { name: 'มุมมองรายวัน' })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test('Day View แสดงเส้นเวลาปัจจุบันเมื่อดูวันนี้', async ({ page }) => {
    await page.getByRole('button', { name: 'วันนี้' }).click();
    await expect(page.locator('.now-line')).toHaveCount(1);
  });

  test('เลื่อนวันไปข้างหน้าและกลับมาวันนี้ได้', async ({ page }) => {
    const dateInput = page.getByLabel('วันที่', { exact: true });
    const today = await dateInput.inputValue();

    await page.getByRole('button', { name: 'ถัดไป' }).click();
    await expect(dateInput).not.toHaveValue(today);

    await page.getByRole('button', { name: 'วันนี้' }).click();
    await expect(dateInput).toHaveValue(today);
  });
});
