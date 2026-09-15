import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem?: number },
) => Promise<Buffer>;

/**
 * เก็บรหัสผ่านเป็น hash เท่านั้น (บรีฟข้อ 16 — ห้ามเก็บ plain text)
 * ใช้ scrypt ของ Node โดยตรง ไม่ต้องพึ่ง native dependency ที่ build บน Vercel ยาก
 * รูปแบบที่เก็บ: scrypt$N$r$p$<salt base64>$<hash base64>
 */
const PARAMS = { N: 16384, r: 8, p: 1, keylen: 64 };

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(plain.normalize('NFKC'), salt, PARAMS.keylen, {
    N: PARAMS.N,
    r: PARAMS.r,
    p: PARAMS.p,
    maxmem: 64 * 1024 * 1024,
  });
  return ['scrypt', PARAMS.N, PARAMS.r, PARAMS.p, salt.toString('base64'), derived.toString('base64')].join('$');
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, nRaw, rRaw, pRaw, saltB64, hashB64] = parts;
  const salt = Buffer.from(saltB64 ?? '', 'base64');
  const expected = Buffer.from(hashB64 ?? '', 'base64');
  if (salt.length === 0 || expected.length === 0) return false;
  const derived = await scrypt(plain.normalize('NFKC'), salt, expected.length, {
    N: Number(nRaw),
    r: Number(rRaw),
    p: Number(pRaw),
    maxmem: 64 * 1024 * 1024,
  });
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

/** นโยบายรหัสผ่าน: อย่างน้อย 10 ตัวอักษร มีทั้งตัวอักษรและตัวเลข */
export function isStrongEnough(plain: string): boolean {
  return plain.length >= 10 && /[A-Za-z฀-๿]/.test(plain) && /\d/.test(plain);
}
