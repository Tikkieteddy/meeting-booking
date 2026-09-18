/**
 * สร้างไอคอน PNG สำหรับ PWA โดยไม่ต้องพึ่งไลบรารีภายนอก
 *
 * เขียน PNG ด้วยมือ (zlib + CRC32) เพื่อไม่ต้องเพิ่ม dependency อย่าง sharp
 * ซึ่งหนักหลายสิบเมกะไบต์ เพียงเพื่อวาดสี่เหลี่ยมกับตัวอักษร T
 *
 * รูปที่ได้: พื้นสีส้ม TNN (#EC5F27) มีตัว T สีขาวอยู่กลาง
 * รัน: node scripts/generate-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const BRAND = [0xec, 0x5f, 0x27];
const WHITE = [0xff, 0xff, 0xff];

const crcTable = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** เขียน RGBA buffer (size*size*4) ออกเป็นไฟล์ PNG */
function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** สัดส่วนพื้นที่ของพิกเซล (x,y) ที่อยู่ในสี่เหลี่ยมมุมโค้ง — ใช้ลบรอยหยัก */
function roundedRectCoverage(x, y, size, radius, samples = 4) {
  let hits = 0;
  for (let sy = 0; sy < samples; sy += 1) {
    for (let sx = 0; sx < samples; sx += 1) {
      const px = x + (sx + 0.5) / samples;
      const py = y + (sy + 0.5) / samples;
      const dx = Math.max(radius - px, px - (size - radius), 0);
      const dy = Math.max(radius - py, py - (size - radius), 0);
      if (dx * dx + dy * dy <= radius * radius) hits += 1;
    }
  }
  return hits / (samples * samples);
}

/**
 * วาดไอคอนหนึ่งใบ
 * @param size ขนาดด้าน (พิกเซล)
 * @param cornerRatio สัดส่วนรัศมีมุมโค้ง (0 = สี่เหลี่ยมเต็ม สำหรับ maskable)
 * @param glyphScale ย่อตัว T ลงเท่าไร (maskable ต้องเว้นขอบ 20% ตามข้อกำหนด)
 */
function drawIcon(size, cornerRatio, glyphScale) {
  const rgba = Buffer.alloc(size * size * 4);
  const radius = Math.round(size * cornerRatio);
  const c = size / 2;

  // ตัว T: แขนนอน + ขาตั้ง (พิกัดอ้างอิงจากจุดกลาง คูณ glyphScale)
  const bar = { x0: -0.28, x1: 0.28, y0: -0.24, y1: -0.12 };
  const stem = { x0: -0.06, x1: 0.06, y0: -0.24, y1: 0.24 };
  const inGlyph = (px, py) => {
    const gx = (px - c) / (size * glyphScale);
    const gy = (py - c) / (size * glyphScale);
    const inBar = gx >= bar.x0 && gx <= bar.x1 && gy >= bar.y0 && gy <= bar.y1;
    const inStem = gx >= stem.x0 && gx <= stem.x1 && gy >= stem.y0 && gy <= stem.y1;
    return inBar || inStem;
  };

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      const cover = cornerRatio > 0 ? roundedRectCoverage(x, y, size, radius) : 1;
      // ตัวอักษรก็ลบรอยหยักด้วยการสุ่มตัวอย่าง 4x4 เหมือนกัน
      let glyph = 0;
      for (let sy = 0; sy < 4; sy += 1) {
        for (let sx = 0; sx < 4; sx += 1) {
          if (inGlyph(x + (sx + 0.5) / 4, y + (sy + 0.5) / 4)) glyph += 1;
        }
      }
      glyph /= 16;
      const base = BRAND.map((ch, k) => Math.round(ch * (1 - glyph) + WHITE[k] * glyph));
      rgba[i] = base[0];
      rgba[i + 1] = base[1];
      rgba[i + 2] = base[2];
      rgba[i + 3] = Math.round(cover * 255);
    }
  }
  return encodePng(size, rgba);
}

mkdirSync('public/icons', { recursive: true });

const targets = [
  // [ไฟล์, ขนาด, สัดส่วนมุมโค้ง, สัดส่วนตัวอักษร]
  ['public/icons/icon-192.png', 192, 0.22, 1],
  ['public/icons/icon-512.png', 512, 0.22, 1],
  // maskable: เต็มกรอบ ไม่โค้งมุม และย่อตัวอักษรให้อยู่ในวงปลอดภัย 80%
  ['public/icons/icon-maskable-512.png', 512, 0, 0.72],
  // iOS ตัดมุมให้เอง จึงส่งรูปเต็มกรอบไป
  ['public/icons/apple-touch-icon.png', 180, 0, 1],
  // favicon
  ['src/app/icon.png', 64, 0.22, 1],
];

for (const [path, size, corner, glyph] of targets) {
  writeFileSync(path, drawIcon(size, corner, glyph));
  console.log(`✔ ${path} (${size}×${size})`);
}
