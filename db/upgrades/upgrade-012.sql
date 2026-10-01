-- ============================================================
-- อัปเดตฐานข้อมูลระบบจองห้องประชุม TNN — migration 012
-- วิธีใช้: เปิด Neon → SQL Editor → วางทั้งไฟล์ → Run
-- ทั้งหมดอยู่ในธุรกรรมเดียว ถ้าพังกลางทางจะไม่มีอะไรเปลี่ยน
-- ============================================================

BEGIN;

-- ยกระดับสิทธิ์เป็นระบบเฉพาะในธุรกรรมนี้ (ทุกตารางบังคับ RLS ไว้)
SELECT set_config('app.user_role', 'service_role', true);

-- ---------- 012_booking_priority ----------
-- ============================================================
-- 012 — ป้ายความสำคัญและหมวดของการประชุม (ตามแบบจาก Stitch)
--
--   priority  = normal (ปกติ) | urgent (ด่วน) | vip (VIP) | internal (ภายใน)
--   category  = หมวดสั้น ๆ ที่ผู้จองพิมพ์เอง เช่น "การตลาด" "ข่าว" (ไม่เกิน 40 ตัวอักษร)
--
-- เพิ่มคอลัมน์แบบมีค่าเริ่มต้น/ว่างได้ โค้ดรุ่นเก่าที่ยังรันอยู่ไม่รู้จักคอลัมน์ก็ไม่พัง
-- view ปฏิทินเพิ่มคอลัมน์ต่อท้าย (CREATE OR REPLACE ทำได้เมื่อเพิ่มท้ายเท่านั้น)
-- ============================================================

ALTER TABLE bookings
  ADD COLUMN priority text NOT NULL DEFAULT 'normal',
  ADD COLUMN category text;

ALTER TABLE bookings ADD CONSTRAINT bookings_priority_valid
  CHECK (priority IN ('normal', 'urgent', 'vip', 'internal'));
ALTER TABLE bookings ADD CONSTRAINT bookings_category_valid
  CHECK (category IS NULL OR length(btrim(category)) BETWEEN 1 AND 40);

CREATE OR REPLACE VIEW app.v_calendar_bookings WITH (security_invoker = on) AS
SELECT
  b.id,
  b.room_id,
  b.series_id,
  b.starts_at,
  b.ends_at,
  b.buffer_before_minutes,
  b.buffer_after_minutes,
  b.status,
  b.privacy,
  b.attendee_count,
  b.checked_in_at,
  b.booker_profile_id,
  app.can_see_booking_details(b.booker_profile_id, b.room_id, b.privacy, b.attendee_profile_ids) AS can_see_details,
  CASE WHEN app.can_see_booking_details(b.booker_profile_id, b.room_id, b.privacy, b.attendee_profile_ids)
       THEN b.title ELSE 'ไม่ว่าง' END AS title,
  CASE WHEN app.can_see_booking_details(b.booker_profile_id, b.room_id, b.privacy, b.attendee_profile_ids)
       THEN b.booker_name ELSE NULL END AS booker_name,
  CASE WHEN app.can_see_booking_details(b.booker_profile_id, b.room_id, b.privacy, b.attendee_profile_ids)
       THEN b.booker_department ELSE NULL END AS booker_department,
  CASE WHEN app.can_see_booking_details(b.booker_profile_id, b.room_id, b.privacy, b.attendee_profile_ids)
       THEN b.purpose ELSE NULL END AS purpose,
  -- 012: ป้ายความสำคัญและหมวด — ซ่อนจากคนที่ไม่มีสิทธิ์เห็นรายละเอียด (เหมือนหัวข้อ)
  CASE WHEN app.can_see_booking_details(b.booker_profile_id, b.room_id, b.privacy, b.attendee_profile_ids)
       THEN b.priority ELSE 'normal' END AS priority,
  CASE WHEN app.can_see_booking_details(b.booker_profile_id, b.room_id, b.privacy, b.attendee_profile_ids)
       THEN b.category ELSE NULL END AS category
FROM bookings b
WHERE b.status <> 'draft';

INSERT INTO schema_migrations (version, name) VALUES ('012', '012_booking_priority')
  ON CONFLICT (version) DO NOTHING;

COMMIT;

-- ---------- ตรวจผล: ทุกแถวต้องขึ้น "ผ่าน" ----------
SELECT set_config('app.user_role', 'service_role', false);
SELECT m.version AS migration,
       CASE WHEN s.version IS NULL THEN 'ไม่ผ่าน' ELSE 'ผ่าน' END AS result
FROM (VALUES ('012')) AS m(version)
LEFT JOIN schema_migrations s ON s.version = m.version
ORDER BY m.version;
