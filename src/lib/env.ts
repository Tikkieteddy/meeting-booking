import { z } from 'zod';

/**
 * ตัวแปรสภาพแวดล้อม (Environment variables)
 * - ตัวแปรที่ขึ้นต้น NEXT_PUBLIC_ ถือว่า "เปิดเผยต่อ browser" (บรีฟ 22.8)
 * - ตัวแปรอื่นทั้งหมดเป็น server-only ห้ามนำไปใช้ใน component ฝั่ง client
 * - ห้าม log ค่าของ secret ทุกกรณี
 */

const bool = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? def : v === 'true' || v === '1'));

const serverSchema = z.object({
  APP_ENV: z.enum(['development', 'preview', 'staging', 'production', 'test']).default('development'),
  APP_TIMEZONE: z.string().default('Asia/Bangkok'),
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),

  DATABASE_URL: z.string().min(1, 'ต้องตั้งค่า DATABASE_URL'),
  DIRECT_URL: z.string().optional(),
  DATABASE_SSL: bool(false),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(5),

  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET ต้องยาวอย่างน้อย 32 ตัวอักษร'),
  AUTH_SESSION_HOURS: z.coerce.number().int().min(1).max(720).default(12),
  // อายุเซสชันเมื่อผู้ใช้ติ๊ก "จำการเข้าสู่ระบบไว้" (วัน)
  AUTH_REMEMBER_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  AUTH_ALLOW_SELF_REGISTER: bool(true),
  AUTH_ALLOWED_EMAIL_DOMAINS: z.string().default(''),

  EMAIL_PROVIDER: z.enum(['resend', 'log']).default('log'),
  EMAIL_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('TNN Meeting <no-reply@example.com>'),
  EMAIL_REPLY_TO: z.string().optional(),
  EMAIL_WEBHOOK_SECRET: z.string().optional(),

  LINE_PROVIDER: z.enum(['messaging-api', 'log']).default('log'),
  LINE_CHANNEL_SECRET: z.string().optional(),
  LINE_CHANNEL_ACCESS_TOKEN: z.string().optional(),

  CRON_SECRET: z.string().optional(),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  RELEASE_VERSION: z.string().default('dev'),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | null = null;

/** อ่าน env ฝั่ง server แบบ lazy — จะ throw เฉพาะเมื่อมีการเรียกใช้จริง (build ไม่ล้ม) */
export function env(): ServerEnv {
  if (cached) return cached;
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n  ');
    throw new Error(
      `ตั้งค่า Environment variable ไม่ครบหรือไม่ถูกต้อง:\n  ${problems}\n` +
        'ดูรายการตัวแปรทั้งหมดที่ .env.example และคู่มือ docs/infrastructure-setup.md',
    );
  }
  cached = parsed.data;
  return cached;
}

/** สำหรับเทสต์: ล้าง cache หลังเปลี่ยน process.env */
export function resetEnvCache() {
  cached = null;
}

/** โดเมนอีเมลที่อนุญาตให้สมัคร (ว่าง = อนุญาตทุกโดเมน) */
export function allowedEmailDomains(): string[] {
  return env()
    .AUTH_ALLOWED_EMAIL_DOMAINS.split(',')
    .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean);
}

export const isProduction = () => env().APP_ENV === 'production';
