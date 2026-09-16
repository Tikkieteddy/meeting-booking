import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

/**
 * เทสต์ระดับ Integration — ต่อ PostgreSQL จริง
 * ต้องตั้ง TEST_DATABASE_URL (หรือ DATABASE_URL) ให้ชี้ไปฐานข้อมูลสำหรับทดสอบ
 * สคริปต์ตั้งต้นจะรัน migration ใหม่ทั้งหมดก่อนเริ่มเทสต์
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      // โค้ดฝั่ง server ใช้ 'server-only' เพื่อกันการ import เข้า client
      // ใน vitest ไม่มี RSC จึงต้อง alias เป็น stub ว่าง
      'server-only': resolve(__dirname, './tests/stubs/server-only.ts'),
    },
  },
  test: {
    name: 'integration',
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    globalSetup: ['./tests/integration/setup.ts'],
    globals: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
    // เทสต์แต่ละไฟล์ใช้ฐานข้อมูลร่วมกัน จึงรันแบบเรียงลำดับเพื่อไม่ให้ข้อมูลชนกัน
    fileParallelism: false,
  },
});
