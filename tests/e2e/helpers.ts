import { expect, type Page } from '@playwright/test';

/** บัญชีตัวอย่างจากสคริปต์ seed (ข้อมูลสมมติทั้งหมด) */
export const ACCOUNTS = {
  admin: { email: 'admin@example.com', password: 'TnnDemo2569!', name: 'สมชาย ผู้ดูแลระบบ' },
  approver: { email: 'approver@example.com', password: 'TnnDemo2569!', name: 'วิชัย หัวหน้าฝ่าย' },
  employee: { email: 'user1@example.com', password: 'TnnDemo2569!', name: 'ปิยะ พนักงานข่าว' },
  viewer: { email: 'reception@example.com', password: 'TnnDemo2569!', name: 'สุดา ประชาสัมพันธ์' },
} as const;

export type Role = keyof typeof ACCOUNTS;

/** ไฟล์เก็บ session ต่อบทบาท สร้างโดย auth.setup.ts */
export const STORAGE_STATE: Record<Role, string> = {
  admin: 'playwright/.auth/admin.json',
  approver: 'playwright/.auth/approver.json',
  employee: 'playwright/.auth/employee.json',
  viewer: 'playwright/.auth/viewer.json',
};

/** ปิด guided tour ถ้าโผล่มา (ผู้ใช้ครั้งแรก) */
export async function dismissTutorial(page: Page) {
  const skip = page.getByRole('button', { name: 'ข้าม' });
  try {
    await skip.waitFor({ state: 'visible', timeout: 3000 });
    await skip.click();
    await skip.waitFor({ state: 'hidden', timeout: 3000 });
  } catch {
    // ผู้ใช้ผ่าน tutorial ไปแล้ว ไม่ต้องทำอะไร
  }
}

/** เปิดหน้าปฏิทินให้พร้อมใช้งาน (ปิด tour ถ้ามี) */
export async function openCalendar(page: Page) {
  await page.goto('/calendar');
  await dismissTutorial(page);
  await expect(page.getByRole('tab', { name: 'มุมมองรายวัน' })).toBeVisible();
}

/**
 * หน้าหลักต้องไม่เลื่อนแนวนอน (บรีฟข้อ 12 และ AC09)
 * ตารางเวลาเลื่อนได้ในกรอบของตัวเอง แต่ตัวหน้าเว็บต้องไม่เลื่อน
 */
export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(overflow.scrollWidth, 'หน้าหลักต้องไม่เลื่อนแนวนอน').toBeLessThanOrEqual(overflow.clientWidth + 2);
}

/** วันที่พรุ่งนี้ตามเวลาไทย */
export function tomorrowISO(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date(Date.now() + 24 * 3600_000));
}

/** วันที่ล่วงหน้า n วันตามเวลาไทย */
export function futureISO(days: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date(Date.now() + days * 24 * 3600_000));
}

/**
 * วันทำการ (จันทร์-ศุกร์) ถัดไปที่ห่างจากวันนี้อย่างน้อย n วัน
 * ห้องตัวอย่างเปิดเฉพาะวันจันทร์ถึงศุกร์ ถ้าเทสต์เลือกวันเสาร์-อาทิตย์
 * ระบบจะปฏิเสธด้วยข้อความ "ห้องปิดให้บริการในวันนี้" ซึ่งถูกต้องตามกฎธุรกิจ
 */
export function nextWeekdayISO(minDaysAhead: number): string {
  for (let offset = minDaysAhead; offset < minDaysAhead + 7; offset += 1) {
    const date = new Date(Date.now() + offset * 24 * 3600_000);
    const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Bangkok', weekday: 'short' }).format(date);
    if (weekday !== 'Sat' && weekday !== 'Sun') {
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(date);
    }
  }
  throw new Error('หาวันทำการไม่ได้');
}

/** แถบบนของแอป — ใช้จำกัดขอบเขต selector ไม่ให้ชนกับการ์ดในปฏิทิน */
export function header(page: Page) {
  return page.locator('header');
}

/**
 * วันที่สำหรับจองในเทสต์ แยกตาม project (ขนาดจอ) ไม่ให้ชนกันเอง
 *
 * ทุก project รันบนฐานข้อมูลเดียวกัน ถ้าใช้วันเดียวกันหมด การจองของ project แรก
 * จะทำให้ project ถัดไปชนเวลาและล้มโดยไม่ใช่บั๊กของระบบ
 * จึงเว้นห่าง project ละหนึ่งสัปดาห์ และให้แต่ละเทสต์ใช้ "เวลา" ต่างกันภายในวันนั้น
 */
const PROJECT_WEEK_OFFSET: Record<string, number> = {
  desktop: 0,
  laptop: 7,
  tablet: 14,
  mobile: 21,
};

export function bookingDateISO(projectName: string): string {
  return nextWeekdayISO(3 + (PROJECT_WEEK_OFFSET[projectName] ?? 0));
}
