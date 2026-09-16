import { execFileSync } from 'node:child_process';
import { loadDotEnv } from '../../scripts/load-env';

/**
 * ตั้งต้นฐานข้อมูลก่อนรันเทสต์ e2e ทั้งชุด
 * รัน migration ใหม่ทั้งหมดแล้ว seed ข้อมูลตัวอย่าง เพื่อให้ผลเทสต์ทำซ้ำได้
 * (ถ้าไม่ล้าง ข้อมูลจากรอบก่อนจะทำให้ช่วงเวลาที่เทสต์ใช้ชนกันเอง)
 *
 * ข้าม step นี้ได้ด้วย E2E_SKIP_DB_RESET=1 เมื่อต้องการรันซ้ำเร็ว ๆ บนข้อมูลเดิม
 */
export default function globalSetup() {
  if (process.env.E2E_SKIP_DB_RESET === '1') {
    console.log('ข้ามการล้างฐานข้อมูลตามค่า E2E_SKIP_DB_RESET');
    return;
  }

  loadDotEnv();
  if (process.env.APP_ENV === 'production') {
    throw new Error('ห้ามรันเทสต์ e2e โดยชี้ไปฐานข้อมูล production');
  }

  console.log('เตรียมฐานข้อมูลสำหรับเทสต์ e2e (migrate --reset + seed)');
  execFileSync('npx', ['tsx', 'scripts/migrate.ts', '--reset'], { stdio: 'inherit' });
  execFileSync('npx', ['tsx', 'scripts/seed.ts'], { stdio: 'inherit' });
}
