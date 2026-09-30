import { test, expect, type Locator } from '@playwright/test';
import { STORAGE_STATE, bookingDateISO, openCalendar } from './helpers';

/**
 * เวลาเตือนก่อนประชุมแบบ Google Calendar: แต่ละแถวเป็น [ตัวเลข][หน่วย] ✕ เพิ่มได้หลายแถว
 * 0 นาที = ตอนเริ่มประชุม ตั้งตอนจองและแก้ภายหลังได้จากหน้ารายละเอียด
 */
test.use({ storageState: STORAGE_STATE.employee });

const ROOM_LABEL = 'ห้องประชุมย่อย 2 · 6 คน';

async function clearReminders(scope: Locator) {
  const remove = scope.getByRole('button', { name: /ลบการแจ้งเตือน/ });
  while ((await remove.count()) > 0) await remove.first().click();
}

test('ตั้งเตือนหลายครั้งตอนจอง รวม "ตอนเริ่มประชุม" แล้วแก้ภายหลังได้', async ({ page }) => {
  await openCalendar(page);
  await page.getByRole('button', { name: /จองห้องประชุม|^จอง$/ }).first().click();
  const dialog = page.getByRole('dialog', { name: 'จองห้องประชุม' });
  const reminders = dialog.getByRole('group', { name: 'การแจ้งเตือน' });
  await expect(reminders).toBeVisible();

  await clearReminders(reminders);
  await expect(reminders.getByText('ไม่มีการแจ้งเตือน')).toBeVisible();

  // แถวแรก: เพิ่มแล้วตั้งเป็น 0 นาที = ตอนเริ่มประชุม
  await reminders.getByRole('button', { name: '+ เพิ่มการแจ้งเตือน' }).click();
  await expect(reminders.getByLabel('การแจ้งเตือนที่ 1 จำนวน')).toHaveValue('30');
  await reminders.getByLabel('การแจ้งเตือนที่ 1 จำนวน').fill('0');
  await expect(reminders.getByText('แถวนี้ = เตือนตอนเริ่มประชุม')).toBeVisible();

  // แถวที่สอง: 3 ชั่วโมง (แบบ Google: ตัวเลข + หน่วย)
  await reminders.getByRole('button', { name: '+ เพิ่มการแจ้งเตือน' }).click();
  await reminders.getByLabel('การแจ้งเตือนที่ 2 หน่วย').selectOption({ label: 'ชั่วโมง' });
  await reminders.getByLabel('การแจ้งเตือนที่ 2 จำนวน').fill('3');

  // เพิ่มได้ไม่เกิน 5 ครั้ง
  const add = reminders.getByRole('button', { name: '+ เพิ่มการแจ้งเตือน' });
  for (let i = 0; i < 3; i++) await add.click();
  await expect(add).toBeDisabled();
  for (let i = 0; i < 3; i++) await reminders.getByRole('button', { name: /ลบการแจ้งเตือน/ }).last().click();

  await dialog.getByLabel('หัวข้อประชุม').fill(`ทดสอบเตือน ${Date.now()}`);
  await dialog.getByLabel('ห้องประชุม').selectOption({ label: ROOM_LABEL });
  await dialog.getByLabel('วันที่', { exact: true }).fill(bookingDateISO(test.info().project.name));
  await dialog.getByLabel('เวลาเริ่ม').selectOption('14:00');

  const created = page.waitForResponse((r) => r.url().endsWith('/api/bookings') && r.request().method() === 'POST');
  await dialog.getByRole('button', { name: 'ยืนยันการจอง' }).click();
  const response = await created;
  expect(response.status()).toBe(201);
  const body = await response.json();
  const booking = body.booking ?? body.data?.booking;
  expect(booking.reminderLeads).toEqual([180, 0]);

  // หน้ารายละเอียด: เห็นค่าที่เลือก และแก้ได้
  await page.goto(`/bookings/${booking.id}`);
  const mine = page.getByRole('group', { name: 'การแจ้งเตือนของฉันสำหรับการจองนี้' });
  await expect(mine.getByLabel('การแจ้งเตือนที่ 1 จำนวน')).toHaveValue('3');
  await expect(mine.getByLabel('การแจ้งเตือนที่ 1 หน่วย')).toHaveValue('hour');
  await expect(mine.getByLabel('การแจ้งเตือนที่ 2 จำนวน')).toHaveValue('0');

  // เปลี่ยนเป็น 1 วัน
  await mine.getByLabel('การแจ้งเตือนที่ 1 หน่วย').selectOption({ label: 'วัน' });
  await mine.getByLabel('การแจ้งเตือนที่ 1 จำนวน').fill('1');
  await page.getByRole('button', { name: 'บันทึก', exact: true }).click();
  await expect(page.getByText('บันทึกการแจ้งเตือนแล้ว')).toBeVisible();
  await page.reload();
  const after = page.getByRole('group', { name: 'การแจ้งเตือนของฉันสำหรับการจองนี้' });
  await expect(after.getByLabel('การแจ้งเตือนที่ 1 จำนวน')).toHaveValue('1');
  await expect(after.getByLabel('การแจ้งเตือนที่ 1 หน่วย')).toHaveValue('day');
});

test('ตั้งค่าเริ่มต้นของการเตือนในหน้าโปรไฟล์ได้แบบเดียวกัน', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'เปลี่ยนค่าตั้งส่วนตัวของบัญชีร่วม ทำครั้งเดียวพอ');
  await page.goto('/profile');
  await page.getByRole('tab', { name: 'ตั้งค่าการแจ้งเตือน' }).click();
  const group = page.getByRole('group', { name: 'เตือนก่อนประชุม' });
  await expect(group).toBeVisible();
  const rows = group.locator('[data-reminder-row]');
  const before = await rows.count();
  await group.getByRole('button', { name: '+ เพิ่มการแจ้งเตือน' }).click();
  await expect(rows).toHaveCount(before + 1);
  // ไม่บันทึก — ไม่ให้กระทบเทสต์อื่นที่ใช้บัญชีเดียวกัน
});
