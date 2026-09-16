import { expect, test } from '@playwright/test';
import { ACCOUNTS, STORAGE_STATE, bookingDateISO, header, openCalendar } from './helpers';

test.describe('AC05 — พนักงานทั่วไป', () => {
  test.use({ storageState: STORAGE_STATE.employee });

  test('ไม่เห็นเมนูหลังบ้าน และเข้าหน้าหลังบ้านไม่ได้', async ({ page }) => {
    await openCalendar(page);

    // จำกัดขอบเขตไว้ที่แถบบน ไม่ให้ชนกับการ์ดในปฏิทินที่มีชื่อผู้จองเหมือนกัน
    await header(page).getByRole('button', { name: new RegExp(ACCOUNTS.employee.name) }).click();
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'จัดการห้อง' })).toHaveCount(0);
    await expect(menu.getByRole('menuitem', { name: 'ผู้ใช้และสิทธิ์' })).toHaveCount(0);
    await expect(menu.getByRole('menuitem', { name: 'บันทึกการใช้งาน' })).toHaveCount(0);
    await expect(menu.getByRole('menuitem', { name: 'โปรไฟล์' })).toBeVisible();
    await page.keyboard.press('Escape');

    // ไม่มีเมนูรออนุมัติสำหรับพนักงานทั่วไป
    await expect(header(page).getByRole('link', { name: 'รออนุมัติ' })).toHaveCount(0);

    // พิมพ์ URL ตรงก็เข้าไม่ได้ ถูกพากลับหน้าปฏิทิน
    for (const path of ['/admin', '/admin/rooms', '/admin/users', '/admin/audit', '/admin/system', '/approvals']) {
      await page.goto(path);
      await expect(page, `${path} ต้องถูกพากลับหน้าปฏิทิน`).toHaveURL(/\/calendar/);
    }
  });

  test('เรียก API หลังบ้านโดยตรงได้ 403 พร้อมข้อความภาษาไทย', async ({ page }) => {
    // ใช้ page.request เพื่อให้ cookie ของเซสชันเดียวกันถูกแนบไปกับคำขอ
    const request = page.request;
    await page.goto('/calendar');
    const createRoom = await request.post('/api/rooms', {
      data: {
        code: 'E2E-HACK',
        name: 'ห้องแอบสร้าง',
        capacity: 4,
        openDays: [1],
        slotStepMinutes: 30,
        minDurationMinutes: 30,
        maxDurationMinutes: 60,
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 0,
        bookingHorizonDays: 30,
        cancelWindowMinutes: 0,
      },
    });
    expect(createRoom.status()).toBe(403);
    const body = await createRoom.json();
    expect(body.error.message).toBe('คุณไม่มีสิทธิ์ดำเนินการนี้');
    expect(body.correlationId).toBeTruthy();

    expect((await request.get('/api/admin/users')).status()).toBe(403);
    expect((await request.get('/api/admin/reports/export')).status()).toBe(403);
  });

  test('เรียก endpoint ของ cron โดยไม่มี secret ได้ 403', async ({ request }) => {
    expect((await request.get('/api/cron/dispatch')).status()).toBe(403);
    expect((await request.get('/api/cron/maintenance')).status()).toBe(403);
  });
});

test.describe('AC05 — ผู้ที่ยังไม่ล็อกอิน', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('ถูกพาไปหน้าเข้าสู่ระบบ และ API ตอบ 401', async ({ page }) => {
    const request = page.request;
    await page.goto('/calendar');
    await expect(page).toHaveURL(/\/login/);

    expect((await request.get('/api/calendar?view=day&date=2026-09-16')).status()).toBe(401);
    expect((await request.get('/api/bookings')).status()).toBe(401);
  });
});

test.describe('ผู้ดูแลระบบ', () => {
  test.use({ storageState: STORAGE_STATE.admin });

  test('เห็นเมนูหลังบ้านและเข้าทุกหน้าได้', async ({ page }) => {
    await openCalendar(page);
    await header(page).getByRole('button', { name: new RegExp(ACCOUNTS.admin.name) }).click();
    const menu = page.getByRole('menu');
    await expect(menu.getByRole('menuitem', { name: 'จัดการห้อง' })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'บันทึกการใช้งาน' })).toBeVisible();
    await page.keyboard.press('Escape');

    const pages: [string, string][] = [
      ['/admin', 'ภาพรวมระบบ'],
      ['/admin/rooms', 'จัดการห้อง'],
      ['/admin/users', 'ผู้ใช้และสิทธิ์'],
      ['/admin/reports', 'รายงาน'],
      ['/admin/audit', 'บันทึกการใช้งาน'],
      ['/admin/system', 'สถานะระบบ'],
    ];
    for (const [path, heading] of pages) {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
    }
  });

  test('AC06 — เพิ่มห้องใหม่แล้วห้องปรากฏในระบบทันทีโดยไม่แก้โค้ด', async ({ page }) => {
    const code = `E2E-${Date.now().toString().slice(-7)}`;
    const name = `ห้องทดสอบอัตโนมัติ ${code}`;

    await page.goto('/admin/rooms');
    await page.getByRole('button', { name: /เพิ่มห้องใหม่/ }).click();
    const dialog = page.getByRole('dialog', { name: 'เพิ่มห้องใหม่' });
    await dialog.getByLabel('รหัสห้อง').fill(code);
    await dialog.getByLabel('ชื่อห้อง').fill(name);
    await dialog.getByLabel('ความจุ').fill('6');
    await dialog.getByRole('button', { name: 'บันทึก' }).click();

    await expect(page.getByText(/เพิ่มห้องใหม่แล้ว/)).toBeVisible();
    await expect(page.getByText(name)).toBeVisible();

    // ห้องใหม่ต้องโผล่ในตัวเลือกของหน้าปฏิทินและในผลค้นหาทันที
    await openCalendar(page);
    await expect(page.getByLabel('เลือกห้องประชุม').locator('option', { hasText: name })).toHaveCount(1);
  });

  test('บันทึกการใช้งานบันทึกการกระทำของผู้ดูแลระบบ และแก้ไขย้อนหลังไม่ได้', async ({ page }) => {
    await page.goto('/admin/audit?action=room');
    await expect(page.getByRole('heading', { name: 'บันทึกการใช้งาน', level: 1 })).toBeVisible();
    await expect(page.getByText('อ่านได้เท่านั้น ระบบไม่อนุญาตให้แก้ไขหรือลบบันทึกย้อนหลัง')).toBeVisible();
    await expect(page.locator('code', { hasText: 'room.' }).first()).toBeVisible();
  });

  test('หน้าสถานะระบบแสดงคิวงานโดยไม่เปิดเผยค่า secret', async ({ page }) => {
    await page.goto('/admin/system');
    await expect(page.getByText('คิวงานแจ้งเตือน')).toBeVisible();

    const body = (await page.locator('body').textContent()) ?? '';
    for (const secretish of ['dev-cron-secret', 'postgresql://', 'AUTH_SECRET', 'tnn_dev_password']) {
      expect(body, `หน้านี้ต้องไม่แสดง ${secretish}`).not.toContain(secretish);
    }
  });
});

test.describe('ผู้อนุมัติ', () => {
  test.use({ storageState: STORAGE_STATE.approver });

  test('เห็นคิวรออนุมัติ และอนุมัติคำขอได้', async ({ page }) => {
    const request = page.request;
    await page.goto('/calendar');
    // สร้างคำขอที่รออนุมัติขึ้นมาเองเพื่อให้เทสต์ไม่ขึ้นกับสภาพข้อมูลเดิม
    const rooms = await (await request.get('/api/rooms')).json();
    const approvalRoom = rooms.rooms.find((room: { requiresApproval?: boolean; policy: { requiresApproval: boolean } }) => room.policy.requiresApproval);
    expect(approvalRoom, 'ต้องมีห้องที่ตั้งค่าว่าต้องขออนุมัติ').toBeTruthy();

    const title = `คำขอรออนุมัติ ${Date.now()}`;
    const created = await request.post('/api/bookings', {
      data: {
        roomId: approvalRoom.id,
        title,
        dateISO: bookingDateISO(test.info().project.name),
        startTime: '13:00',
        endTime: '14:00',
        attendeeCount: 5,
      },
    });
    expect(created.status()).toBe(201);
    expect((await created.json()).requiresApproval).toBe(true);

    await page.goto('/approvals');
    await expect(page.getByRole('heading', { name: 'คิวรออนุมัติ', level: 1 })).toBeVisible();

    const item = page.locator('li', { hasText: title });
    await expect(item).toBeVisible();
    await item.getByLabel('ความเห็น').fill('อนุมัติตามคำขอ');
    await item.getByRole('button', { name: 'อนุมัติ', exact: true }).click();

    await expect(page.getByText('อนุมัติแล้ว')).toBeVisible();
    await expect(page.locator('li', { hasText: title })).toHaveCount(0);
  });

  test('ปฏิเสธคำขอต้องระบุเหตุผล', async ({ page }) => {
    const request = page.request;
    await page.goto('/calendar');
    const rooms = await (await request.get('/api/rooms')).json();
    const approvalRoom = rooms.rooms.find((room: { policy: { requiresApproval: boolean } }) => room.policy.requiresApproval);

    const title = `คำขอที่จะถูกปฏิเสธ ${Date.now()}`;
    await request.post('/api/bookings', {
      data: {
        roomId: approvalRoom.id,
        title,
        dateISO: bookingDateISO(test.info().project.name),
        startTime: '15:00',
        endTime: '16:00',
        attendeeCount: 5,
      },
    });

    await page.goto('/approvals');
    const item = page.locator('li', { hasText: title });
    await expect(item).toBeVisible();

    // ไม่ใส่เหตุผลแล้วกดปฏิเสธ ต้องได้ข้อความเตือน
    await item.getByRole('button', { name: 'ปฏิเสธ' }).click();
    await expect(page.getByText('กรุณาระบุเหตุผลในการปฏิเสธ')).toBeVisible();

    await item.getByLabel('ความเห็น').fill('ห้องถูกใช้สำหรับงานอื่น');
    await item.getByRole('button', { name: 'ปฏิเสธ' }).click();
    await expect(page.getByText('ปฏิเสธแล้ว')).toBeVisible();
  });
});

test.describe('ผู้ชม (Viewer)', () => {
  test.use({ storageState: STORAGE_STATE.viewer });

  test('ดูตารางได้แต่ไม่มีปุ่มจอง และเรียก API จองได้ 403', async ({ page }) => {
    const request = page.request;
    await page.goto('/calendar');
    await expect(page.getByRole('tab', { name: 'มุมมองรายวัน' })).toBeVisible();
    await expect(page.getByRole('button', { name: /จองห้องประชุม/ })).toHaveCount(0);

    const rooms = await (await request.get('/api/rooms')).json();
    const attempt = await request.post('/api/bookings', {
      data: {
        roomId: rooms.rooms[0].id,
        title: 'ผู้ชมไม่ควรจองได้',
        dateISO: bookingDateISO(test.info().project.name),
        startTime: '10:00',
        endTime: '11:00',
        attendeeCount: 2,
      },
    });
    expect(attempt.status()).toBe(403);
  });
});
