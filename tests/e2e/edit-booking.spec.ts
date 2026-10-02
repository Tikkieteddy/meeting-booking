import { test, expect, type Page } from '@playwright/test';
import { STORAGE_STATE, bookingDateISO, openCalendar } from './helpers';


/**
 * แก้ไขการจองที่จองไปแล้ว (ผู้ใช้ขอ 1 ต.ค. 2569) — เปิดได้จากหน้ารายละเอียดแบบลิงก์ตรง
 * และจากหน้าต่างรายละเอียดในหน้า "การจองของฉัน" ใช้ฟอร์มเดียวกับตอนจอง แต่เปลี่ยนห้องไม่ได้
 */
test.use({ storageState: STORAGE_STATE.employee });

// ห้องย่อย 2 ช่วง 12:00–13:00 และ 15:00–16:00 — สเปกอื่นใช้ห้องนี้ที่ 09:00, 11:00, 14:00, 16:00 (ห้ามชนกัน)

async function createBooking(page: Page, title: string, startTime: string, endTime: string) {
  const rooms = await (await page.request.get('/api/rooms')).json();
  const room = rooms.rooms.find((r: { name: string }) => r.name === 'ห้องประชุมย่อย 2');
  const res = await page.request.post('/api/bookings', {
    data: {
      roomId: room.id,
      title,
      dateISO: bookingDateISO(test.info().project.name),
      startTime,
      endTime,
      attendeeCount: 2,
      purpose: 'วัตถุประสงค์เดิม',
    },
  });
  expect(res.status()).toBe(201);
  return (await res.json()).booking as { id: string };
}

test('แก้ไขหัวข้อ ย้ายห้อง และเวลาจากหน้ารายละเอียด', async ({ page }) => {
  const title = `ก่อนแก้ ${Date.now()}`;
  const booking = await createBooking(page, title, '12:00', '12:30');

  await page.goto(`/bookings/${booking.id}`);
  await page.getByRole('button', { name: 'แก้ไข', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'แก้ไขการจอง' });
  await expect(dialog.getByLabel('หัวข้อประชุม')).toHaveValue(title);
  await expect(dialog.getByLabel('วัตถุประสงค์')).toHaveValue('วัตถุประสงค์เดิม');
  await expect(dialog.getByLabel('เวลาเริ่ม')).toHaveValue('12:00');
  await expect(dialog.getByLabel('เวลาสิ้นสุด')).toHaveValue('12:30');
  // การเกิดซ้ำตั้งได้เฉพาะตอนจอง
  await expect(dialog.getByRole('group', { name: 'การจองซ้ำ' })).toHaveCount(0);

  const newTitle = `หลังแก้ ${Date.now()}`;
  await dialog.getByLabel('หัวข้อประชุม').fill(newTitle);
  // ย้ายห้องได้ (ผู้ใช้ขอ 1 ต.ค. 2569) — ห้องกองบรรณาธิการไม่มีสเปกอื่นจองช่วงนี้
  await dialog.getByLabel('ห้องประชุม').selectOption({ label: 'ห้องประชุมกองบรรณาธิการ · 12 คน' });
  await dialog.getByLabel('เวลาสิ้นสุด').selectOption('13:00');
  const saved = page.waitForResponse((r) => r.url().endsWith(`/api/bookings/${booking.id}`) && r.request().method() === 'PATCH');
  await dialog.getByRole('button', { name: 'บันทึกการแก้ไข' }).click();
  const response = await saved;
  expect(response.status()).toBe(200);
  // ส่งเฉพาะช่องที่เปลี่ยน — ไม่ส่งผู้เข้าร่วม/อุปกรณ์ซ้ำ (ส่งซ้ำจะล้างคำตอบรับของผู้เข้าร่วม)
  const sent = response.request().postDataJSON();
  expect(Object.keys(sent).sort()).toEqual(['dateISO', 'endTime', 'expectedVersion', 'roomId', 'startTime', 'title']);

  await expect(page.getByText('บันทึกการแก้ไขแล้ว')).toBeVisible();
  await expect(page.getByRole('heading', { name: newTitle, level: 1 })).toBeVisible();
  await expect(page.getByText('12:00 – 13:00 น.', { exact: false })).toBeVisible();
  await expect(page.getByText('ห้องประชุมกองบรรณาธิการ', { exact: false }).first()).toBeVisible();
});

test('แก้ไขจากหน้าต่างรายละเอียดในหน้าการจองของฉัน', async ({ page }) => {
  const title = `แก้จากรายการ ${Date.now()}`;
  await createBooking(page, title, '15:00', '15:30');

  await page.goto('/bookings');
  await page.getByRole('button', { name: new RegExp(title) }).click();
  await page.getByRole('dialog', { name: 'รายละเอียดการจอง' }).getByRole('button', { name: 'แก้ไข', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'แก้ไขการจอง' });
  await dialog.getByLabel('วัตถุประสงค์').fill('วัตถุประสงค์ใหม่');
  await dialog.getByRole('button', { name: 'บันทึกการแก้ไข' }).click();
  await expect(page.getByText('บันทึกการแก้ไขแล้ว')).toBeVisible();

  // ปิดฟอร์มแล้วกลับมาที่หน้าต่างรายละเอียด พร้อมข้อมูลใหม่
  const detail = page.getByRole('dialog', { name: 'รายละเอียดการจอง' });
  await expect(detail.getByText('วัตถุประสงค์ใหม่')).toBeVisible();
});

test('หน้าต่างฟอร์มจองอยู่ในกรอบจอ เลื่อนถึงปุ่มยืนยันได้', async ({ page }) => {
  // บั๊กที่เคยเกิด: แผงกระจกเบลอของเนื้อหาทำให้หน้าต่าง (position: fixed) ยึดกรอบแผงแทนจอ
  // หน้าต่างจึงสูงเกินจอ ช่องหมายเหตุและปุ่มยืนยันตกขอบ เลื่อนลงไม่ได้
  await openCalendar(page);
  await page.getByRole('button', { name: /จองห้องประชุม|^จอง$/ }).first().click();
  const dialog = page.getByRole('dialog', { name: 'จองห้องประชุม' });
  await expect(dialog).toBeVisible();
  const viewport = page.viewportSize()!;
  const box = (await dialog.boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);

  await dialog.getByLabel('หมายเหตุ').scrollIntoViewIfNeeded();
  await expect(dialog.getByLabel('หมายเหตุ')).toBeInViewport();
  await expect(dialog.getByRole('button', { name: 'ยืนยันการจอง' })).toBeInViewport();
});

test('แก้ไขหรือยกเลิกการจองของคนอื่นไม่ได้ แม้เป็นผู้อนุมัติ', async ({ page, browser }) => {
  // ตรวจสิทธิ์ที่ API ไม่ขึ้นกับขนาดจอ — รันครั้งเดียวพอ (ระบบจำกัดการจองต่อบัญชี 30 ครั้ง/5 นาที)
  test.skip(test.info().project.name !== 'desktop', 'ไม่ขึ้นกับขนาดจอ');
  const booking = await createBooking(page, `ของพนักงาน ${Date.now()}`, '12:30', '13:00');
  const other = await browser.newContext({ storageState: STORAGE_STATE.approver });
  try {
    const edit = await other.request.patch(`/api/bookings/${booking.id}`, { data: { title: 'แอบแก้', expectedVersion: 1 } });
    expect(edit.status()).toBe(403);
    const cancel = await other.request.post(`/api/bookings/${booking.id}/cancel`, { data: { reason: 'แอบยกเลิก' } });
    expect(cancel.status()).toBe(403);
  } finally {
    await other.close();
  }
});

test('ยกเลิกการจองต้องใส่เหตุผล และเลือกวันย้อนหลังไม่ได้', async ({ page }) => {
  // ทดสอบบนคอมและมือถือพอ (ระบบจำกัดการจองต่อบัญชี 30 ครั้ง/5 นาที)
  test.skip(!['desktop', 'mobile'].includes(test.info().project.name), 'ครอบคลุมด้วยคอมและมือถือแล้ว');
  const title = `ยกเลิกต้องมีเหตุผล ${Date.now()}`;
  const booking = await createBooking(page, title, '15:30', '16:00');
  await page.goto(`/bookings/${booking.id}`);

  // ช่องวันที่ในฟอร์มแก้ไขเริ่มได้ตั้งแต่วันนี้
  await page.getByRole('button', { name: 'แก้ไข', exact: true }).click();
  const edit = page.getByRole('dialog', { name: 'แก้ไขการจอง' });
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
  await expect(edit.getByLabel('วันที่', { exact: true })).toHaveAttribute('min', today);
  await edit.getByRole('button', { name: 'ยกเลิก', exact: true }).click();

  await page.getByRole('button', { name: /ยกเลิกการจอง/ }).click();
  const confirm = page.getByRole('dialog', { name: 'ยืนยันยกเลิกการจองนี้' });
  await confirm.getByRole('button', { name: 'ยืนยัน' }).click();
  await expect(confirm.getByText('กรุณาระบุเหตุผลการยกเลิก')).toBeVisible();
  await expect(confirm).toBeVisible();

  await confirm.getByLabel('เหตุผลการยกเลิก').fill('ประชุมเลื่อน');
  await confirm.getByRole('button', { name: 'ยืนยัน' }).click();
  await expect(page.getByText('ยกเลิกการจองแล้ว')).toBeVisible();
});
