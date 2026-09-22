import { test, expect } from '@playwright/test';
import { STORAGE_STATE } from './helpers';

/**
 * ตำแหน่งบนแผนที่ — ตั้งที่อาคารครั้งเดียว แล้วทุกจุดที่แสดงห้องในอาคารนั้นต้องกดเปิดแผนที่ได้
 */
test.describe('ตำแหน่งบนแผนที่', () => {
  test.use({ storageState: STORAGE_STATE.admin });

  test('วางลิงก์ Google Maps แล้วระบบดึงพิกัดมาปักหมุดให้เอง', async ({ page }) => {
    await page.goto('/admin/rooms');
    await page.getByRole('button', { name: /เพิ่มอาคาร/ }).click();
    const dialog = page.getByRole('dialog', { name: 'เพิ่มอาคาร' });
    const url = page.getByLabel('ลิงก์แผนที่', { exact: true });
    await url.fill('https://www.google.com/maps/place/TNN/@13.7563,100.5018,17z/data=x');
    await expect(dialog.getByLabel('ละติจูด', { exact: true })).toHaveValue('13.7563');
    await expect(dialog.getByLabel('ลองจิจูด', { exact: true })).toHaveValue('100.5018');
    await expect(dialog.getByText('ดึงพิกัดจากลิงก์แล้ว')).toBeVisible();
    // ปุ่มเปิดแผนที่ในฟอร์มชี้ไปที่ลิงก์ที่วาง
    await expect(dialog.getByRole('link', { name: /เปิดแผนที่/ })).toHaveAttribute('href', /google\.com\/maps\/place/);
  });

  test('ตั้งตำแหน่งที่อาคาร แล้วห้องในอาคารนั้นมีปุ่มเปิดแผนที่ในทุกจุด', async ({ page }) => {
    const suffix = Date.now().toString().slice(-6);
    const buildingCode = `MAP-${suffix}`;
    const roomCode = `MR-${suffix}`;
    const roomName = `ห้องมีแผนที่ ${suffix}`;

    // สร้างอาคารที่มีพิกัด (ไม่มีลิงก์) → ลิงก์ต้องถูกสร้างจากพิกัด
    const b = await page.request.post('/api/buildings', {
      data: { name: `อาคารแผนที่ ${suffix}`, code: buildingCode, latitude: 13.7563, longitude: 100.5018 },
    });
    expect(b.status()).toBe(201);
    const buildingId = (await b.json()).building.id as string;

    // ห้องที่ไม่ได้ตั้งตำแหน่งเอง → ต้องได้ลิงก์ของอาคาร
    const r = await page.request.post('/api/rooms', {
      data: {
        code: roomCode,
        name: roomName,
        capacity: 4,
        buildingId,
        openDays: [1, 2, 3, 4, 5],
        slotStepMinutes: 30,
        minDurationMinutes: 30,
        maxDurationMinutes: 240,
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 0,
        bookingHorizonDays: 90,
        cancelWindowMinutes: 0,
      },
    });
    expect(r.status()).toBe(201);
    const room = (await r.json()).room;
    expect(room.mapLink).toBe('https://www.google.com/maps?q=13.756300,100.501800');

    // จุดที่ 1: รายการห้องในหน้าจัดการ
    await page.goto('/admin/rooms');
    const row = page.locator('li', { hasText: roomName }).first();
    await expect(row.getByRole('link', { name: /เปิดแผนที่/ })).toHaveAttribute('href', /google\.com\/maps\?q=13\.756300,100\.501800/);
    const link = row.getByRole('link', { name: /เปิดแผนที่/ });
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /noopener/);

    // จุดที่ 2: แถบเครื่องมือปฏิทิน เมื่อเลือกห้องนี้
    await page.goto('/calendar');
    await page.getByLabel('เลือกห้องประชุม').selectOption({ label: `${roomName} (4 คน)` });
    await expect(page.getByRole('link', { name: /เปิดแผนที่/ }).first()).toHaveAttribute('href', /google\.com\/maps\?q=/);
  });

  test('ลิงก์แผนที่ที่ไม่ใช่ https ถูกปฏิเสธ และพิกัดต้องมาเป็นคู่', async ({ page }) => {
    const bad = await page.request.post('/api/buildings', { data: { name: 'x', code: `BAD-${Date.now()}`, mapUrl: 'javascript:alert(1)' } });
    expect(bad.status()).toBeGreaterThanOrEqual(400);
    expect(bad.status()).toBeLessThan(500);
    const half = await page.request.post('/api/buildings', { data: { name: 'x', code: `HALF-${Date.now()}`, latitude: 13.7 } });
    expect(half.status()).toBeGreaterThanOrEqual(400);
    expect(half.status()).toBeLessThan(500);
  });
});
