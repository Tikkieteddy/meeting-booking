import { expect, test } from '@playwright/test';
import { STORAGE_STATE, expectNoHorizontalScroll, openCalendar } from './helpers';

/** บรีฟข้อ 12 และ 17: Keyboard, focus, screen reader, zoom 200% */
test.describe('การเข้าถึง (Accessibility)', () => {
  test.use({ storageState: STORAGE_STATE.employee });

  test('มีลิงก์ข้ามไปเนื้อหาหลัก และกด Tab ครั้งแรกถึงลิงก์นั้น', async ({ page }) => {
    await openCalendar(page);
    // เปิดหน้าใหม่เพื่อให้ focus เริ่มจากต้นเอกสาร (ไม่ค้างอยู่ที่ปุ่มของ tour)
    await page.goto('/calendar');
    await page.keyboard.press('Tab');

    const skipLink = page.getByRole('link', { name: 'ข้ามไปยังเนื้อหาหลัก' });
    await expect(skipLink).toBeFocused();

    await page.keyboard.press('Enter');
    await expect(page.locator('#main')).toBeVisible();
  });

  test('สลับมุมมองด้วยคีย์บอร์ดได้ และ aria-selected ถูกต้อง', async ({ page }) => {
    await openCalendar(page);
    const week = page.getByRole('tab', { name: 'มุมมองรายสัปดาห์' });
    await week.focus();
    await expect(week).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(week).toHaveAttribute('aria-selected', 'true');
  });

  test('ปิด dialog ด้วย Escape และคืน focus ให้ปุ่มที่เปิด', async ({ page }) => {
    await openCalendar(page);
    const openButton = page.getByRole('button', { name: 'ตัวกรองเพิ่มเติม' });
    await openButton.click();

    const dialog = page.getByRole('dialog', { name: 'ค้นหา' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(openButton).toBeFocused();
  });

  test('focus วนอยู่ใน dialog ไม่หลุดไปข้างหลัง', async ({ page }) => {
    await openCalendar(page);
    await page.getByRole('button', { name: 'ตัวกรองเพิ่มเติม' }).click();
    const dialog = page.getByRole('dialog', { name: 'ค้นหา' });
    await expect(dialog).toBeVisible();

    for (let i = 0; i < 25; i += 1) await page.keyboard.press('Tab');

    const insideDialog = await dialog.evaluate((el) => el.contains(document.activeElement));
    expect(insideDialog, 'focus ต้องยังอยู่ภายใน dialog').toBe(true);
  });

  test('ทุกฟิลด์ในฟอร์มจองมี label ที่ screen reader อ่านได้', async ({ page }) => {
    await openCalendar(page);
    await page.getByRole('button', { name: /จองห้องประชุม|^จอง$/ }).first().click();
    const dialog = page.getByRole('dialog', { name: 'จองห้องประชุม' });
    await expect(dialog).toBeVisible();

    const unlabeled = await dialog.evaluate((root) => {
      const controls = [...root.querySelectorAll<HTMLElement>('input, select, textarea')];
      return controls
        .filter((el) => {
          if (el.getAttribute('type') === 'hidden') return false;
          if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')) return false;
          return !(el.id && root.ownerDocument.querySelector(`label[for="${el.id}"]`));
        })
        .map((el) => el.outerHTML.slice(0, 80));
    });
    expect(unlabeled, 'ทุก control ต้องมี label').toEqual([]);
  });

  test('ซูม 200% (ย่อ viewport ครึ่งหนึ่ง) แล้วยังใช้งานได้และไม่เลื่อนแนวนอน', async ({ page }) => {
    // การซูม 200% ของเบราว์เซอร์เทียบเท่ากับ viewport ที่เล็กลงครึ่งหนึ่ง
    await page.setViewportSize({ width: 720, height: 450 });
    await openCalendar(page);
    await expect(page.getByRole('button', { name: /จองห้องประชุม|^จอง$/ }).first()).toBeVisible();
    await expect(page.getByRole('tab', { name: 'มุมมองรายวัน' })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test('ขยายขนาดตัวอักษรเป็น 200% แล้วยังกดปุ่มจองได้', async ({ page }) => {
    await openCalendar(page);
    // WCAG 1.4.4: ขยายข้อความ 200% โดยเนื้อหาและฟังก์ชันต้องไม่สูญหาย
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%';
    });
    await expect(page.getByRole('button', { name: /จองห้องประชุม|^จอง$/ }).first()).toBeVisible();
    await expect(page.getByLabel('เลือกห้องประชุม')).toBeVisible();
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '';
    });
  });

  test('สถานะไม่ได้สื่อด้วยสีอย่างเดียว — มีข้อความและสัญลักษณ์กำกับ', async ({ page }) => {
    await openCalendar(page);
    await page.getByRole('tab', { name: 'มุมมองรายเดือน' }).click();
    const legend = page.locator('div', { hasText: 'มีจองบางช่วง' }).last();
    await expect(legend).toContainText('ว่าง');
    await expect(legend).toContainText('ใกล้เต็ม');
    await expect(legend).toContainText('เต็ม');
  });

  test('การ์ดการจองมี aria-label อธิบายเวลาและสถานะ', async ({ page }) => {
    await openCalendar(page);
    await page.getByRole('button', { name: 'วันนี้' }).click();
    // ชื่อของการ์ดต้องเกิดจากเนื้อหาที่แสดงจริง ไม่ใช่ aria-label ที่เขียนแยก
    // (WCAG 2.5.3 Label in Name — คนสั่งงานด้วยเสียงพูดตามที่เห็นบนจอ)
    const card = page.getByRole('button', { name: /สถานะ/ }).first();
    await expect(card).toBeVisible();

    const name = (await card.evaluate((el) => el.textContent ?? '')).replace(/\s+/g, ' ').trim();
    // เวลาต้องอยู่ในรูปแบบเดียวกับที่ตาเห็น คือมีขีดกลางคั่น
    expect(name).toMatch(/\d{2}:\d{2}\u2013\d{2}:\d{2}/);
    // สถานะต้องมีข้อความกำกับ ไม่สื่อด้วยสีหรือสัญลักษณ์อย่างเดียว
    expect(name).toContain('สถานะ');
    // และการ์ดต้องไม่มี aria-label ที่จะหลุดจากเนื้อหาในอนาคต
    expect(await card.getAttribute('aria-label')).toBeNull();
  });
});

test.describe('AC08 — Tutorial', () => {
  test.use({ storageState: STORAGE_STATE.viewer });

  test('เปิดคำแนะนำการใช้งานซ้ำได้จากหน้าช่วยเหลือ และข้ามได้', async ({ page }) => {
    await page.goto('/help');
    await page.getByRole('button', { name: 'ดูคำแนะนำการใช้งานอีกครั้ง' }).click();

    const tour = page.getByRole('dialog', { name: 'แนะนำการใช้งาน' });
    await expect(tour).toBeVisible();
    await expect(tour).toContainText('ยินดีต้อนรับ');
    // หน้าช่วยเหลือไม่มีปฏิทิน จึงไม่มีจุดให้ชี้ ต้องถอยไปเป็นกล่องกลางจอ ไม่ใช่ล้ม
    await expect(tour).toHaveAttribute('data-tour-card', 'centered');

    await tour.getByRole('button', { name: 'ถัดไป' }).click();
    await expect(tour).toContainText('เปลี่ยนวันที่ตรงนี้');

    await tour.getByRole('button', { name: 'ข้าม' }).click();
    await expect(tour).toBeHidden();
  });
});
