import { test, expect } from '@playwright/test';
import { STORAGE_STATE, openCalendar } from './helpers';

/**
 * ชั้นความสูง (z-index): เมนูบนแถบหัวและแถบล่างมือถือต้องอยู่เหนือเนื้อหาปฏิทินเสมอ
 *
 * บั๊กที่เคยเกิด: เส้นเวลาปัจจุบัน (z-30) ลอยทับเมนูโปรไฟล์ เพราะแถบหัวก็ z-30
 * เส้นนั้นโผล่เฉพาะช่วงเวลาทำการ เทสต์จึงตรวจ "กฎ" แทนการรอให้เส้นโผล่:
 * ทุกชิ้นในเนื้อหาหน้าต้องมีชั้นต่ำกว่าแถบหัวและแถบล่าง
 */
test.use({ storageState: STORAGE_STATE.employee });

for (const view of ['day', 'week', 'month'] as const) {
  test(`มุมมอง ${view}: ไม่มีชิ้นไหนในปฏิทินอยู่ชั้นสูงกว่าแถบหัว`, async ({ page }) => {
    await openCalendar(page);
    const tabName = { day: 'มุมมองรายวัน', week: 'มุมมองรายสัปดาห์', month: 'มุมมองรายเดือน' }[view];
    await page.getByRole('tab', { name: tabName }).click();

    const result = await page.evaluate(() => {
      const z = (el: Element) => {
        const v = Number.parseInt(getComputedStyle(el).zIndex, 10);
        return Number.isNaN(v) ? 0 : v;
      };
      const header = document.querySelector('header')!;
      let maxInMain = 0;
      let culprit = '';
      for (const el of document.querySelectorAll('#main *')) {
        const cs = getComputedStyle(el);
        if (cs.position === 'fixed') continue; // dialog / คำแนะนำ ตั้งใจลอยเหนือทุกอย่าง
        if (z(el) > maxInMain) {
          maxInMain = z(el);
          culprit = (el as HTMLElement).className?.toString().slice(0, 80) ?? el.tagName;
        }
      }
      return { header: z(header), maxInMain, culprit };
    });
    expect(result.maxInMain, `ชิ้นที่สูงสุดในเนื้อหา: ${result.culprit}`).toBeLessThan(result.header);
  });
}

test('เปิดเมนูโปรไฟล์แล้ว ตรงกลางเมนูต้องเป็นเมนูจริง ไม่ใช่ของอื่นทับ', async ({ page }) => {
  await openCalendar(page);
  await page.getByRole('button', { name: /เมนูของ/ }).click();
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  const covered = await menu.evaluate((m) => {
    // สุ่มตรวจหลายจุดตามความสูงของเมนู — ต้องชี้เจอเมนูเองทุกจุด
    const r = m.getBoundingClientRect();
    const bad: string[] = [];
    for (let i = 1; i < 10; i++) {
      const y = r.top + (r.height * i) / 10;
      const x = r.left + r.width / 2;
      const hit = document.elementFromPoint(x, y);
      if (hit && !m.contains(hit)) bad.push((hit as HTMLElement).className?.toString().slice(0, 60) ?? hit.tagName);
    }
    return bad;
  });
  expect(covered, 'มีของอื่นทับเมนู').toEqual([]);
});
