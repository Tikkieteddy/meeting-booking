import { test, expect } from '@playwright/test';
import { STORAGE_STATE, openCalendar } from './helpers';

/**
 * การเกิดซ้ำแบบ Google Calendar: ตัวเลือกสำเร็จรูปเปลี่ยนตามวันที่ และ "กำหนดเอง…" ตั้งละเอียดได้
 * (ตรวจที่ตัวฟอร์มและข้อมูลที่ส่งไป API โดยไม่ต้องสร้างการจองจริงหลายสิบรายการ)
 */
test.use({ storageState: STORAGE_STATE.employee });

test('ตัวเลือกสำเร็จรูปตรงกับวันที่เลือก และกำหนดเองส่งกฎที่ถูกต้อง', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop' && testInfo.project.name !== 'mobile', 'ตรวจจอใหญ่และจอเล็กพอ');
  await openCalendar(page);
  await page.getByRole('button', { name: /จองห้องประชุม|^จอง$/ }).first().click();
  const dialog = page.getByRole('dialog', { name: 'จองห้องประชุม' });

  // 2026-12-30 = วันพุธสุดท้ายของ ธ.ค.
  await dialog.getByLabel('วันที่', { exact: true }).fill('2026-12-30');
  const repeat = dialog.getByRole('combobox', { name: 'การจองซ้ำ' });
  const labels = await repeat.locator('option').allTextContents();
  expect(labels).toEqual([
    'ไม่เกิดซ้ำ',
    'รายวัน',
    'รายสัปดาห์ ในวันพุธ',
    'รายเดือน ในวันพุธสุดท้าย',
    'รายเดือน ในวันที่ 30',
    'รายปี ในวันที่ 30 ธันวาคม',
    'ทุกวันธรรมดา (วันจันทร์ถึงวันศุกร์)',
    'กำหนดเอง…',
  ]);

  await repeat.selectOption({ label: 'รายเดือน ในวันพุธสุดท้าย' });
  await expect(dialog.getByText(/ทุกเดือน ในวันพุธสุดท้าย รวม 10 ครั้ง/)).toBeVisible();

  // กำหนดเอง: ทุก 2 สัปดาห์ วันจันทร์และวันพุธ สิ้นสุดหลัง 6 ครั้ง
  await repeat.selectOption({ label: 'กำหนดเอง…' });
  await dialog.getByLabel('ซ้ำทุก').fill('2');
  await dialog.getByLabel('หน่วย', { exact: true }).selectOption({ label: 'สัปดาห์' });
  const days = dialog.getByRole('group', { name: 'ซ้ำในวัน' });
  await expect(days.getByRole('button', { name: 'วันพุธ' })).toHaveAttribute('aria-pressed', 'true');
  await days.getByRole('button', { name: 'วันจันทร์' }).click();
  await dialog.getByLabel('จำนวนครั้ง').fill('6');
  await expect(dialog.getByText(/ทุก 2 สัปดาห์ \(วันจันทร์, พุธ\) รวม 6 ครั้ง/)).toBeVisible();

  // ข้อมูลที่ส่งไปต้องเป็นกฎตามที่เห็น — ดักคำขอไว้ ไม่ให้สร้างการจองจริง
  let sent: Record<string, unknown> | null = null;
  await page.route('**/api/bookings', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    sent = route.request().postDataJSON();
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ requiresApproval: false, skipped: [] }) });
  });
  await dialog.getByLabel('หัวข้อประชุม').fill('ประชุมซ้ำทดสอบ');
  await dialog.getByRole('button', { name: 'ยืนยันการจอง' }).click();
  await expect.poll(() => sent).not.toBeNull();
  expect((sent as unknown as { recurrence: unknown }).recurrence).toEqual({
    frequency: 'weekly',
    intervalCount: 2,
    byWeekdays: [3, 1],
    monthWeek: null,
    untilDate: null,
    occurrenceCount: 6,
  });
});
