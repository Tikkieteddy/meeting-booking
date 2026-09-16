/**
 * ตั้งต้นฐานข้อมูลสำหรับเทสต์ Integration
 * รัน migration ทั้งหมดใหม่ตั้งแต่ต้น เพื่อให้ผลเทสต์ทำซ้ำได้เสมอ
 */
import { execFileSync } from 'node:child_process';
import { loadDotEnv } from '../../scripts/load-env';

export default async function setup() {
  loadDotEnv(['.env.test.local', '.env.local', '.env']);

  const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'เทสต์ Integration ต้องมี TEST_DATABASE_URL (หรือ DATABASE_URL) ชี้ไปฐานข้อมูลสำหรับทดสอบ\n' +
        'ตัวอย่าง: TEST_DATABASE_URL=postgresql://user:pass@127.0.0.1:5432/tnn_meeting_test',
    );
  }
  if (!/test/i.test(url)) {
    throw new Error('เพื่อความปลอดภัย ชื่อฐานข้อมูลของเทสต์ต้องมีคำว่า "test" อยู่ด้วย');
  }

  process.env.DATABASE_URL = url;
  process.env.DIRECT_URL = url;
  process.env.APP_ENV = 'test';
  process.env.AUTH_SECRET = process.env.AUTH_SECRET ?? 'test-secret-value-at-least-32-characters-long';
  process.env.EMAIL_PROVIDER = 'log';
  process.env.LINE_PROVIDER = 'log';
  process.env.LOG_LEVEL = 'error';
  process.env.DATABASE_POOL_MAX = process.env.DATABASE_POOL_MAX ?? '12';

  const env = { ...process.env, DATABASE_URL: url, DIRECT_URL: url, APP_ENV: 'test' };
  execFileSync('npx', ['tsx', 'scripts/migrate.ts', '--reset'], { stdio: 'inherit', env });
}
