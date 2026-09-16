import { expect, test } from '@playwright/test';
import { STORAGE_STATE, bookingDateISO, openCalendar } from './helpers';

const ROOM_LABEL = 'ห้องประชุมย่อย 2 · 6 คน';

test.use({ storageState: STORAGE_STATE.employee });

test.describe('การจองห้องประชุม', () => {
  test.beforeEach(async ({ page }) => {
    await openCalendar(page);
  });

  async function openBookingForm(page: import('@playwright/test').Page) {
    await page.getByRole('button', { name: /จองห้องประชุม|^จอง$/ }).first().click();
    const dialog = page.getByRole('dialog', { name: 'จองห้องประชุม' });
    await expect(dialog).toBeVisible();
    return dialog;
  }

  test('จองสำเร็จจากปุ่มจอง และเห็นในหน้าการจองของฉัน', async ({ page }) => {
    const title = `ประชุมทดสอบ E2E ${Date.now()}`;
    const dialog = await openBookingForm(page);

    await dialog.getByLabel('หัวข้อประชุม').fill(title);
    await dialog.getByLabel('ห้องประชุม').selectOption({ label: ROOM_LABEL });
    await dialog.getByLabel('วันที่', { exact: true }).fill(bookingDateISO(test.info().project.name));
    await dialog.getByLabel('เวลาเริ่ม').selectOption('11:00');
    await dialog.getByLabel('จำนวนผู้เข้าร่วม').fill('3');
    await dialog.getByRole('button', { name: 'ยืนยันการจอง' }).click();

    await expect(dialog).toBeHidden();
    await expect(page.getByText('จองห้องสำเร็จ')).toBeVisible();

    await page.goto('/bookings');
    await expect(page.getByText(title)).toBeVisible();
  });

  test('AC03 — จองเวลาที่ชนกันแล้วได้ข้อความอธิบายว่าชนกับรายการใด', async ({ page }) => {
    const dateISO = bookingDateISO(test.info().project.name);

    const first = await openBookingForm(page);
    await first.getByLabel('หัวข้อประชุม').fill(`จองรอบแรก ${Date.now()}`);
    await first.getByLabel('ห้องประชุม').selectOption({ label: ROOM_LABEL });
    await first.getByLabel('วันที่', { exact: true }).fill(dateISO);
    await first.getByLabel('เวลาเริ่ม').selectOption('16:00');
    await first.getByRole('button', { name: 'ยืนยันการจอง' }).click();
    await expect(first).toBeHidden();

    const second = await openBookingForm(page);
    await second.getByLabel('หัวข้อประชุม').fill('จองซ้อนต้องไม่สำเร็จ');
    await second.getByLabel('ห้องประชุม').selectOption({ label: ROOM_LABEL });
    await second.getByLabel('วันที่', { exact: true }).fill(dateISO);
    await second.getByLabel('เวลาเริ่ม').selectOption('16:00');
    await second.getByRole('button', { name: 'ยืนยันการจอง' }).click();

    // ฟอร์มยังเปิดอยู่และแสดงเหตุผลว่าชนกับการจองใด
    await expect(second).toBeVisible();
    await expect(second.getByRole('alert')).toContainText('ช่วงเวลานี้ถูกจองไปแล้ว');
    await expect(second.getByRole('alert')).toContainText('16:00');
  });

  test('ตรวจกฎธุรกิจฝั่ง server และแสดง error ติดฟิลด์', async ({ page }) => {
    const dialog = await openBookingForm(page);

    await dialog.getByLabel('หัวข้อประชุม').fill('เกินความจุห้อง');
    await dialog.getByLabel('ห้องประชุม').selectOption({ label: ROOM_LABEL });
    await dialog.getByLabel('วันที่', { exact: true }).fill(bookingDateISO(test.info().project.name));
    await dialog.getByLabel('จำนวนผู้เข้าร่วม').fill('99');
    await dialog.getByRole('button', { name: 'ยืนยันการจอง' }).click();

    await expect(dialog.getByText(/จำนวนผู้เข้าร่วมเกินความจุห้อง/)).toBeVisible();
    await expect(dialog).toBeVisible();
  });

  test('เปิดรายละเอียดการจองและมีลิงก์ดาวน์โหลดไฟล์ปฏิทิน', async ({ page }) => {
    await page.getByRole('button', { name: 'วันนี้' }).click();
    const card = page.locator('button[aria-label*="สถานะ"]').first();
    await expect(card).toBeVisible();
    await card.click();

    const dialog = page.getByRole('dialog', { name: 'รายละเอียดการจอง' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('link', { name: /เพิ่มลงปฏิทิน/ })).toHaveAttribute('href', /\/ics$/);
  });

  test('ยกเลิกการจองของตัวเองได้ และต้องยืนยันก่อน', async ({ page }) => {
    const title = `ประชุมที่จะยกเลิก ${Date.now()}`;
    const dialog = await openBookingForm(page);
    await dialog.getByLabel('หัวข้อประชุม').fill(title);
    await dialog.getByLabel('ห้องประชุม').selectOption({ label: ROOM_LABEL });
    await dialog.getByLabel('วันที่', { exact: true }).fill(bookingDateISO(test.info().project.name));
    await dialog.getByLabel('เวลาเริ่ม').selectOption('09:00');
    await dialog.getByRole('button', { name: 'ยืนยันการจอง' }).click();
    await expect(dialog).toBeHidden();

    await page.goto('/bookings');
    await page.getByText(title).click();

    const detail = page.getByRole('dialog', { name: 'รายละเอียดการจอง' });
    await expect(detail).toBeVisible();
    await detail.getByRole('button', { name: /ยกเลิกการจอง/ }).click();

    // ต้องยืนยันก่อนจึงยกเลิกจริง (บรีฟข้อ 12)
    const confirm = page.getByRole('dialog', { name: 'ยืนยันยกเลิกการจองนี้' });
    await expect(confirm).toBeVisible();
    await confirm.getByLabel('เหตุผลการยกเลิก').fill('ทดสอบยกเลิก');
    await confirm.getByRole('button', { name: 'ยืนยัน' }).click();

    await expect(page.getByText('ยกเลิกการจองแล้ว')).toBeVisible();
  });
});

test.describe('ระบบค้นหา', () => {
  test.use({ storageState: STORAGE_STATE.employee });

  test('AC02 — ค้นหาห้อง ผู้จอง และช่วงเวลาว่างได้', async ({ page }) => {
    await openCalendar(page);
    await page.getByRole('button', { name: 'ตัวกรองเพิ่มเติม' }).click();
    const dialog = page.getByRole('dialog', { name: 'ค้นหา' });
    await expect(dialog).toBeVisible();

    // 1) ค้นหาห้องประชุม
    await dialog.getByRole('searchbox').fill('ห้องประชุมย่อย');
    await expect(dialog.getByText('ห้องประชุมย่อย 2').first()).toBeVisible();

    // 2) ค้นหาชื่อผู้จอง
    await dialog.getByRole('tab', { name: 'ผู้จอง' }).click();
    await dialog.getByRole('searchbox').fill('ปิยะ');
    await expect(dialog.getByText('ประชุมวางแผนข่าวเช้า').first()).toBeVisible();

    // 3) ค้นหาช่วงเวลาว่างด้วยคำค้นภาษาไทยแบบผสม
    await dialog.getByRole('searchbox').fill('พรุ่งนี้ 08:00 ถึง 09:00 4 คน');
    await dialog.getByRole('tab', { name: 'ช่วงเวลาว่าง' }).click();
    await expect(dialog.getByRole('button', { name: 'จองเลย' }).first()).toBeVisible();
  });

  test('ล้างเงื่อนไขทั้งหมดได้ และมี filter chip ที่ลบทีละเงื่อนไข', async ({ page }) => {
    await openCalendar(page);
    await page.getByRole('button', { name: 'ตัวกรองเพิ่มเติม' }).click();
    const dialog = page.getByRole('dialog', { name: 'ค้นหา' });

    await dialog.getByRole('searchbox').fill('พรุ่งนี้ 10:00 ถึง 11:00 6 คน');
    await dialog.getByRole('button', { name: 'ล้างทั้งหมด' }).click();
    await expect(dialog.getByRole('searchbox')).toHaveValue('');

    await dialog.getByText('ตัวกรองเพิ่มเติม', { exact: true }).click();
    await dialog.getByLabel('ความจุขั้นต่ำ').fill('6');
    const chip = dialog.getByRole('button', { name: /ลบเงื่อนไข/ }).first();
    await expect(chip).toBeVisible();
    await chip.click();
    await expect(dialog.getByRole('button', { name: /ลบเงื่อนไข/ })).toHaveCount(0);
  });
});
