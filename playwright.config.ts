import { defineConfig, devices } from '@playwright/test';

/**
 * เทสต์ End-to-End (บรีฟข้อ 17)
 * ทดสอบหน้าจอที่ 360px, 768px, 1024px และ Desktop กว้าง ตามที่บรีฟกำหนด
 *
 * ก่อนรัน: ต้องมีฐานข้อมูลที่ migrate + seed แล้ว (npm run db:reset)
 * รัน: npm run test:e2e
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://127.0.0.1:${PORT}`;

/**
 * บางสภาพแวดล้อม (เช่น container ของ CI) มี Chromium ติดตั้งไว้ล่วงหน้าแล้ว
 * แต่เป็นรุ่นที่ไม่ตรงกับที่ @playwright/test คาดไว้
 * ตั้ง PW_CHROMIUM_PATH ให้ชี้ไปที่ binary นั้นได้ เช่น
 *   PW_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npm run test:e2e
 * ถ้าไม่ตั้งค่า จะใช้เบราว์เซอร์ที่ `npx playwright install` ดาวน์โหลดมาให้ตามปกติ
 */
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;
const launchOptions = executablePath ? { executablePath } : {};

export default defineConfig({
  testDir: './tests/e2e',
  // ล้างและ seed ฐานข้อมูลก่อนเริ่มทั้งชุด ให้ผลเทสต์ทำซ้ำได้
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    locale: 'th-TH',
    timezoneId: 'Asia/Bangkok',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions,
  },
  projects: [
    // ล็อกอินครั้งเดียวต่อบทบาทแล้วเก็บ session ไว้ใช้ร่วมกัน
    // (ระบบจำกัดอัตราการล็อกอินไว้กัน brute force ถ้าล็อกอินใหม่ทุกเทสต์จะไปติด rate limit เอง)
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
      dependencies: ['setup'],
    },
    {
      name: 'laptop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1024, height: 768 } },
      dependencies: ['setup'],
    },
    {
      name: 'tablet',
      use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 }, hasTouch: true },
      dependencies: ['setup'],
    },
    {
      name: 'mobile',
      use: { ...devices['Desktop Chrome'], viewport: { width: 360, height: 740 }, hasTouch: true },
      dependencies: ['setup'],
    },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `${baseURL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
