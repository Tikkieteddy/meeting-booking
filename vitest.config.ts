import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

/** เทสต์ระดับ Unit — ฟังก์ชันบริสุทธิ์ ไม่ต้องมีฐานข้อมูล */
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
    name: 'unit',
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    globals: false,
    testTimeout: 15_000,
  },
});
