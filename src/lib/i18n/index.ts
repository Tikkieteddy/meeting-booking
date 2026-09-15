import { th, type MessageKey } from './th';
import { en } from './en';

export type Locale = 'th' | 'en';
export const LOCALES: Locale[] = ['th', 'en'];
export const DEFAULT_LOCALE: Locale = 'th';

const dictionaries = { th, en } as const;

/**
 * แปลข้อความ — ภาษาไทยเป็นค่าเริ่มต้น (บรีฟข้อ 21)
 * ถ้าคีย์ไม่มีในภาษาที่เลือก จะ fallback เป็นภาษาไทย แล้วจึงเป็นตัวคีย์เอง
 */
export function t(key: MessageKey, params?: Record<string, string | number>, locale: Locale = DEFAULT_LOCALE): string {
  const dict = dictionaries[locale] as Partial<Record<MessageKey, string>>;
  const template = dict[key] ?? th[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match,
  );
}

/** สร้างตัวแปลที่ผูก locale ไว้แล้ว ใช้ใน component ได้สะดวก */
export function translator(locale: Locale = DEFAULT_LOCALE) {
  return (key: MessageKey, params?: Record<string, string | number>) => t(key, params, locale);
}

export type Translate = ReturnType<typeof translator>;
export type { MessageKey };
export function isLocale(value: unknown): value is Locale {
  return value === 'th' || value === 'en';
}
