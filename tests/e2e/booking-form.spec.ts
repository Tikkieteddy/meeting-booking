import { test, expect } from '@playwright/test';
import { STORAGE_STATE, openCalendar } from './helpers';

/**
 * ฟอร์มจอง: เวลาเริ่ม+เวลาสิ้นสุด และผู้เข้าร่วมเลือกจากรายชื่อคนใน / พิมพ์อีเมลคนนอก
 */
test.describe('ฟอร์มจอง — เวลาและผู้เข้าร่วม', () => {
  test.use({ storageState: STORAGE_STATE.employee });

  test('มีช่องเวลาสิ้นสุดให้เลือก และบอกระยะเวลารวมให้', async ({ page }) => {
    await openCalendar(page);
    await page.getByRole('button', { name: /จองห้องประชุม|^จอง$/ }).first().click();
    const dialog = page.getByRole('dialog', { name: 'จองห้องประชุม' });
    const end = dialog.getByLabel('เวลาสิ้นสุด', { exact: true });
    await expect(end).toBeVisible();
    const options = await end.locator('option').allTextContents();
    expect(options.length).toBeGreaterThan(1);
    // เลือกเวลาเริ่ม 10:00 แล้วตัวเลือกสิ้นสุดต้องเริ่มหลัง 10:00
    await dialog.getByLabel('เวลาเริ่ม', { exact: true }).selectOption('10:00');
    const after = await end.locator('option').allTextContents();
    expect(after[0]! > '10:00').toBe(true);
    await expect(dialog.getByText(/รวม /)).toBeVisible();
  });

  test('ค้นคนในองค์กรได้ เห็นช่องทางแจ้งเตือน และเพิ่มอีเมลคนนอกได้', async ({ page }) => {
    await openCalendar(page);
    await page.getByRole('button', { name: /จองห้องประชุม|^จอง$/ }).first().click();
    const dialog = page.getByRole('dialog', { name: 'จองห้องประชุม' });
    const box = dialog.getByRole('combobox', { name: 'ผู้เข้าร่วม' });

    // คนใน: พิมพ์ชื่อบางส่วน → เห็นชื่อเต็ม อีเมล และป้ายช่องทาง
    await box.fill('วิชัย');
    const option = dialog.getByRole('option', { name: /วิชัย หัวหน้าฝ่าย/ });
    await expect(option).toBeVisible();
    await expect(option).toContainText('approver@example.com');
    await expect(option).toContainText('อีเมล');
    await option.click();
    await expect(dialog.getByText('วิชัย หัวหน้าฝ่าย').first()).toBeVisible();
    await expect(dialog.getByText('คนใน').first()).toBeVisible();

    // คนนอก: พิมพ์อีเมลแล้วกด Enter
    await box.fill('guest@partner.example');
    await box.press('Enter');
    // อีเมลปรากฏทั้งบนป้ายและในชื่อปุ่ม "เอาออก" จึงชี้ที่รายการป้าย (listitem) ให้ชัด
    const guestChip = dialog.getByRole('listitem').filter({ hasText: 'guest@partner.example' });
    await expect(guestChip).toBeVisible();
    await expect(guestChip).toContainText('คนนอก');

    // ข้อความที่ไม่ใช่อีเมล ต้องถูกปฏิเสธ
    await box.fill('ไม่ใช่อีเมล');
    await box.press('Enter');
    await expect(dialog.getByText('อีเมลไม่ถูกต้อง')).toBeVisible();

    // เอาออกได้
    await dialog.getByRole('button', { name: /เอาออก guest@partner.example/ }).click();
    await expect(dialog.getByRole('listitem').filter({ hasText: 'guest@partner.example' })).toHaveCount(0);
  });

  test('API ค้นคน: ตัวเองไม่โผล่ ต้องพิมพ์อย่างน้อย 2 ตัว และไม่เกิน 8 คน', async ({ page }) => {
    const short = await page.request.get('/api/people?q=ป');
    expect((await short.json()).people).toEqual([]);
    const res = await page.request.get('/api/people?q=example.com');
    const people = (await res.json()).people as { email: string }[];
    expect(people.length).toBeLessThanOrEqual(8);
    expect(people.some((p) => p.email === 'user1@example.com')).toBe(false); // ตัวเอง
    expect(people.some((p) => p.email === 'approver@example.com')).toBe(true);
  });
});

test.describe('คนที่ยังไม่ล็อกอิน', () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test('ค้นรายชื่อคนในองค์กรไม่ได้', async ({ page }) => {
    const res = await page.request.get('/api/people?q=example');
    expect(res.status()).toBe(401);
  });
});
