-- ============================================================
-- อัปเดตฐานข้อมูลระบบจองห้องประชุม TNN — migration 010
-- วิธีใช้: เปิด Neon → SQL Editor → วางทั้งไฟล์ → Run
-- ทั้งหมดอยู่ในธุรกรรมเดียว ถ้าพังกลางทางจะไม่มีอะไรเปลี่ยน
-- ============================================================

BEGIN;

-- ยกระดับสิทธิ์เป็นระบบเฉพาะในธุรกรรมนี้ (ทุกตารางบังคับ RLS ไว้)
SELECT set_config('app.user_role', 'service_role', true);

-- ---------- 010_booking_reminders ----------
-- ============================================================
-- 010 — เวลาเตือนก่อนประชุมแยกตามการจอง (แบบ Google Calendar)
--
-- เดิมเวลาเตือนมาจากค่าตั้งส่วนตัวในหน้าโปรไฟล์เท่านั้น ใช้เหมือนกันทุกการจอง
-- ผู้ใช้ต้องการเลือกเวลาเตือนได้เองตอนจอง และเตือนได้หลายครั้ง รวมถึงเตือนตอนเริ่มประชุม
--
--   reminder_leads = จำนวนนาทีก่อนเริ่มประชุมที่ผู้จองต้องการให้เตือน
--                    0 = เตือนตอนเริ่มประชุม
--                    NULL = ใช้ค่าตั้งส่วนตัวของผู้จอง (การจองเก่าทั้งหมด)
--                    {} = ไม่ต้องเตือน
-- ผู้เข้าร่วมที่เป็นคนในยังได้เตือนตามค่าตั้งส่วนตัวของแต่ละคน (เหมือน Google)
--
-- ขอบเขตเท่ากับค่าตั้งส่วนตัว: ไม่เกิน 5 ครั้ง ไม่เกิน 1 สัปดาห์ (10080 นาที)
-- เพิ่มคอลัมน์แบบ NULL ได้ โค้ดรุ่นเก่าที่ยังรันอยู่ไม่รู้จักคอลัมน์นี้ก็ไม่พัง
-- ============================================================

ALTER TABLE bookings ADD COLUMN reminder_leads int[];

ALTER TABLE bookings ADD CONSTRAINT bookings_reminder_leads_valid CHECK (
  reminder_leads IS NULL
  OR (cardinality(reminder_leads) <= 5 AND 0 <= ALL (reminder_leads) AND 10080 >= ALL (reminder_leads))
);

COMMENT ON COLUMN bookings.reminder_leads IS
  'นาทีก่อนเริ่มประชุมที่ผู้จองต้องการให้เตือน (0 = ตอนเริ่ม, NULL = ใช้ค่าตั้งส่วนตัว)';

INSERT INTO schema_migrations (version, name) VALUES ('010', '010_booking_reminders')
  ON CONFLICT (version) DO NOTHING;

COMMIT;

-- ---------- ตรวจผล: ทุกแถวต้องขึ้น "ผ่าน" ----------
SELECT set_config('app.user_role', 'service_role', false);
SELECT m.version AS migration,
       CASE WHEN s.version IS NULL THEN 'ไม่ผ่าน' ELSE 'ผ่าน' END AS result
FROM (VALUES ('010')) AS m(version)
LEFT JOIN schema_migrations s ON s.version = m.version
ORDER BY m.version;
