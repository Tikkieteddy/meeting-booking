-- ============================================================
-- 009 — ตำแหน่งบนแผนที่ของอาคารและห้อง
--
-- ผู้ใช้ต้องการให้ทุกจุดที่แสดงห้อง/อาคาร กดเปิดแผนที่ได้ และผู้ดูแลเลือกตำแหน่ง
-- จากแผนที่ได้ตอนตั้งค่า
--
-- เก็บสองแบบพร้อมกัน เพราะใช้คนละงาน
--   * map_url  = ลิงก์แผนที่ที่ผู้ดูแลวางมา (เช่นลิงก์แชร์จาก Google Maps)
--                ใช้เป็นปลายทางเวลากด "เปิดแผนที่" ถ้ามี
--   * latitude / longitude = พิกัดที่ปักหมุดจากแผนที่ในระบบ
--                ใช้สร้างลิงก์เปิดแผนที่เมื่อไม่มี map_url และใส่ในไฟล์ปฏิทิน (.ics GEO)
-- ห้องที่ไม่ได้ตั้งตำแหน่งเอง จะใช้ตำแหน่งของอาคารที่สังกัด (ทำในโค้ด ไม่ใช่ที่นี่)
-- ============================================================

ALTER TABLE buildings
  ADD COLUMN map_url   text,
  ADD COLUMN latitude  double precision,
  ADD COLUMN longitude double precision;

ALTER TABLE rooms
  ADD COLUMN map_url   text,
  ADD COLUMN latitude  double precision,
  ADD COLUMN longitude double precision;

-- พิกัดต้องอยู่ในช่วงจริงของโลก และต้องมาเป็นคู่ (มีละติจูดต้องมีลองจิจูด)
ALTER TABLE buildings ADD CONSTRAINT buildings_latlng_valid CHECK (
  (latitude IS NULL AND longitude IS NULL)
  OR (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)
);
ALTER TABLE rooms ADD CONSTRAINT rooms_latlng_valid CHECK (
  (latitude IS NULL AND longitude IS NULL)
  OR (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)
);

-- ลิงก์แผนที่ต้องเป็น https เท่านั้น กันการฝังลิงก์ javascript: หรือ http ที่ไม่ปลอดภัย
ALTER TABLE buildings ADD CONSTRAINT buildings_map_url_https CHECK (map_url IS NULL OR map_url ~* '^https://');
ALTER TABLE rooms ADD CONSTRAINT rooms_map_url_https CHECK (map_url IS NULL OR map_url ~* '^https://');
