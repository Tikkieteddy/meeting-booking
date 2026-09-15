import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * โทเค็นแบบ opaque: ส่งค่าดิบให้ผู้ใช้ เก็บเฉพาะ hash ในฐานข้อมูล
 * ถ้าฐานข้อมูลรั่ว โทเค็นที่รั่วไปใช้ต่อไม่ได้
 */
export function newToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** รหัสเชื่อมบัญชี LINE แบบอ่านง่าย 8 ตัว ไม่มีอักษรที่สับสน (0/O, 1/I) */
export function newLinkCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const buf = randomBytes(8);
  let out = '';
  for (const byte of buf) out += alphabet[byte % alphabet.length];
  return out;
}
