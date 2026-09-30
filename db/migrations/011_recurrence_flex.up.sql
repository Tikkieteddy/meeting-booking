-- ============================================================
-- 011 — การจองซ้ำแบบยืดหยุ่น (แบบ Google Calendar)
--
-- เพิ่มได้จากเดิม (รายวัน / รายสัปดาห์ / รายเดือนวันที่เดิม)
--   * รายปี                        frequency = 'yearly'
--   * รายเดือนแบบ "วันพุธที่ 2" หรือ "วันพุธสุดท้าย" ของเดือน
--                                  month_week = 1..5 (สัปดาห์ที่) หรือ -1 (สุดท้าย)
--                                  NULL = วันที่เดิมของเดือน (แบบเดิม)
-- "ทุกวันธรรมดา" ใช้ weekly + by_weekdays {1,2,3,4,5} ได้อยู่แล้ว ไม่ต้องเพิ่มอะไร
--
-- ตารางนี้เก็บกฎไว้เป็นประวัติ ตัวการจองแต่ละครั้งถูกแตกออกเป็นแถวใน bookings ตอนจอง
-- โค้ดรุ่นเก่าไม่เขียนค่าใหม่เหล่านี้ จึงรันก่อน deploy ได้โดยไม่กระทบ
-- ============================================================

ALTER TABLE booking_series DROP CONSTRAINT booking_series_frequency_check;
ALTER TABLE booking_series ADD CONSTRAINT booking_series_frequency_check
  CHECK (frequency IN ('daily', 'weekly', 'monthly', 'yearly'));

ALTER TABLE booking_series ADD COLUMN month_week smallint;
ALTER TABLE booking_series ADD CONSTRAINT booking_series_month_week_valid
  CHECK (month_week IS NULL OR (frequency = 'monthly' AND month_week IN (-1, 1, 2, 3, 4, 5)));
