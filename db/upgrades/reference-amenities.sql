-- ============================================================
-- เติมรายการสิ่งอำนวยความสะดวกมาตรฐานลงฐานข้อมูลจริง (Neon)
-- วิธีใช้: เปิด Neon → SQL Editor → วางทั้งไฟล์ → Run
-- รันซ้ำได้ ไม่ซ้ำ ไม่ลบของเดิม
-- ============================================================

BEGIN;
SELECT set_config('app.user_role', 'service_role', true);

INSERT INTO amenities (code, name_th, name_en, icon, sort_order) VALUES ('tv', 'ทีวี', 'TV', 'tv', 10)
  ON CONFLICT (code) DO UPDATE SET name_th = excluded.name_th, name_en = excluded.name_en, icon = excluded.icon, sort_order = excluded.sort_order;
INSERT INTO amenities (code, name_th, name_en, icon, sort_order) VALUES ('projector', 'โปรเจกเตอร์', 'Projector', 'projector', 20)
  ON CONFLICT (code) DO UPDATE SET name_th = excluded.name_th, name_en = excluded.name_en, icon = excluded.icon, sort_order = excluded.sort_order;
INSERT INTO amenities (code, name_th, name_en, icon, sort_order) VALUES ('video_conference', 'ประชุมทางไกล', 'Video conference', 'video', 30)
  ON CONFLICT (code) DO UPDATE SET name_th = excluded.name_th, name_en = excluded.name_en, icon = excluded.icon, sort_order = excluded.sort_order;
INSERT INTO amenities (code, name_th, name_en, icon, sort_order) VALUES ('whiteboard', 'ไวท์บอร์ด', 'Whiteboard', 'board', 40)
  ON CONFLICT (code) DO UPDATE SET name_th = excluded.name_th, name_en = excluded.name_en, icon = excluded.icon, sort_order = excluded.sort_order;
INSERT INTO amenities (code, name_th, name_en, icon, sort_order) VALUES ('microphone', 'ไมโครโฟน', 'Microphone', 'mic', 50)
  ON CONFLICT (code) DO UPDATE SET name_th = excluded.name_th, name_en = excluded.name_en, icon = excluded.icon, sort_order = excluded.sort_order;
INSERT INTO amenities (code, name_th, name_en, icon, sort_order) VALUES ('speaker', 'ลำโพง', 'Speaker', 'speaker', 60)
  ON CONFLICT (code) DO UPDATE SET name_th = excluded.name_th, name_en = excluded.name_en, icon = excluded.icon, sort_order = excluded.sort_order;
INSERT INTO amenities (code, name_th, name_en, icon, sort_order) VALUES ('phone', 'โทรศัพท์', 'Phone', 'phone', 70)
  ON CONFLICT (code) DO UPDATE SET name_th = excluded.name_th, name_en = excluded.name_en, icon = excluded.icon, sort_order = excluded.sort_order;
INSERT INTO amenities (code, name_th, name_en, icon, sort_order) VALUES ('accessible', 'รองรับผู้ใช้รถเข็น', 'Wheelchair accessible', 'accessible', 80)
  ON CONFLICT (code) DO UPDATE SET name_th = excluded.name_th, name_en = excluded.name_en, icon = excluded.icon, sort_order = excluded.sort_order;

COMMIT;

-- ---------- ตรวจผล: ต้องขึ้น ผ่าน ----------
SELECT set_config('app.user_role', 'service_role', false);
SELECT count(*) AS amenities, CASE WHEN count(*) >= 8 THEN 'ผ่าน' ELSE 'ไม่ผ่าน' END AS result FROM amenities;
